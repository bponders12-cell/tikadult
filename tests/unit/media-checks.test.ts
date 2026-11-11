import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { containerProbe } from "@/lib/media/probe";
import { runChecks } from "@/lib/media/checks";
import { enqueueMediaProcessing, processMedia } from "@/lib/media/processing";
import { runPendingMedia } from "@/workers/media-worker";
import {
  createMedia,
  getMedia,
  listPendingMedia,
  resetMemoryMedia,
  setMediaAsset,
  setMemoryTimestamps,
  updateMedia,
} from "@/lib/media/records";
import { getStorage } from "@/lib/media/storage";
import { box, jpeg, mp4, png, webm, webp } from "./helpers/media-fixtures";

const probeOf = (bytes: Uint8Array, type: string) => containerProbe.probe(bytes, type);

describe("containerProbe: video", () => {
  it("reads MP4 duration from mvhd (v0, custom timescale, moov last)", async () => {
    expect(await probeOf(mp4(12.5), "video/mp4")).toEqual({ ok: true, durationSec: 12.5 });
    expect(await probeOf(mp4(7, { timescale: 90000, moovLast: true }), "video/mp4")).toEqual({
      ok: true,
      durationSec: 7,
    });
  });

  it("reads WebM duration from Duration x TimecodeScale (float64, float32, custom scale)", async () => {
    expect(await probeOf(webm(42), "video/webm")).toEqual({ ok: true, durationSec: 42 });
    const f32 = await probeOf(webm(30, { float32: true }), "video/webm");
    expect(f32.ok && f32.durationSec).toBeCloseTo(30, 3);
    const scaled = await probeOf(webm(10, { timecodeScale: 500_000 }), "video/webm");
    expect(scaled.ok && scaled.durationSec).toBeCloseTo(10, 6);
  });

  it("rejects magic bytes that do not match the declared type", async () => {
    const r = await probeOf(webm(10), "video/mp4");
    expect(r).toMatchObject({ ok: false, code: "magic_mismatch" });
    expect(await probeOf(mp4(10), "video/webm")).toMatchObject({ ok: false, code: "magic_mismatch" });
    expect(await probeOf(Buffer.from("not a video at all"), "video/mp4")).toMatchObject({
      ok: false,
      code: "magic_mismatch",
    });
  });

  it("rejects truncated / corrupt containers", async () => {
    const m = mp4(10);
    expect(await probeOf(m.subarray(0, m.length - 10), "video/mp4")).toMatchObject({ ok: false, code: "corrupt" });
    expect(await probeOf(m.subarray(0, 16), "video/mp4")).toMatchObject({ ok: false, code: "corrupt" });
    // ftyp only, no moov
    const noMoov = box("ftyp", Buffer.from("isom\0\0\0\0isom"));
    expect(await probeOf(noMoov, "video/mp4")).toMatchObject({ ok: false, code: "corrupt" });

    const w = webm(10);
    expect(await probeOf(w.subarray(0, w.length - 4), "video/webm")).toMatchObject({ ok: false, code: "corrupt" });
    expect(await probeOf(w.subarray(0, 6), "video/webm")).toMatchObject({ ok: false, code: "corrupt" });
  });

  it("rejects a zero-timescale MP4 and a WebM with no duration", async () => {
    expect(await probeOf(mp4(10, { timescale: 0 }), "video/mp4")).toMatchObject({ ok: false, code: "corrupt" });
    expect(await probeOf(webm(10, { omitDuration: true }), "video/webm")).toMatchObject({
      ok: false,
      code: "unverifiable_duration",
    });
  });
});

describe("containerProbe: images", () => {
  it("accepts well-formed png/jpeg/webp", async () => {
    expect(await probeOf(png(), "image/png")).toEqual({ ok: true, durationSec: null });
    expect(await probeOf(jpeg(), "image/jpeg")).toEqual({ ok: true, durationSec: null });
    expect(await probeOf(webp(), "image/webp")).toEqual({ ok: true, durationSec: null });
  });

  it("rejects mismatched magic bytes", async () => {
    expect(await probeOf(png(), "image/jpeg")).toMatchObject({ ok: false, code: "magic_mismatch" });
    expect(await probeOf(jpeg(), "image/webp")).toMatchObject({ ok: false, code: "magic_mismatch" });
  });

  it("rejects truncated images", async () => {
    const p = png();
    expect(await probeOf(p.subarray(0, p.length - 8), "image/png")).toMatchObject({ ok: false, code: "corrupt" });
    const j = jpeg();
    expect(await probeOf(j.subarray(0, j.length - 2), "image/jpeg")).toMatchObject({ ok: false, code: "corrupt" });
    const w = webp();
    expect(await probeOf(w.subarray(0, w.length - 3), "image/webp")).toMatchObject({ ok: false, code: "corrupt" });
  });
});

describe("runChecks", () => {
  it("passes a short video and an image", async () => {
    expect(await runChecks({ type: "video", declaredContentType: "video/mp4", bytes: mp4(20) })).toEqual({
      verdict: "pass",
      durationSec: 20,
    });
    expect(await runChecks({ type: "image", declaredContentType: "image/png", bytes: png() })).toMatchObject({
      verdict: "pass",
    });
  });

  it("fails a video over 300s but allows exactly 300s (flagged as near cap)", async () => {
    expect(await runChecks({ type: "video", declaredContentType: "video/mp4", bytes: mp4(300.5) })).toMatchObject({
      verdict: "fail",
    });
    expect(await runChecks({ type: "video", declaredContentType: "video/webm", bytes: webm(301) })).toMatchObject({
      verdict: "fail",
    });
    expect(await runChecks({ type: "video", declaredContentType: "video/mp4", bytes: mp4(300) })).toMatchObject({
      verdict: "flag",
    });
  });

  it("flags (does not fail) a video within 10% of the duration cap", async () => {
    const out = await runChecks({ type: "video", declaredContentType: "video/mp4", bytes: mp4(285) });
    expect(out).toMatchObject({ verdict: "flag", durationSec: 285 });
    expect(out.verdict === "flag" && out.reasons[0]).toMatch(/near_duration_cap/);
    expect(await runChecks({ type: "video", declaredContentType: "video/mp4", bytes: mp4(269) })).toMatchObject({
      verdict: "pass",
    });
  });

  it("fails on type mismatch, empty, oversize, and non-allowlisted types", async () => {
    expect(await runChecks({ type: "video", declaredContentType: "image/png", bytes: png() })).toMatchObject({
      verdict: "fail",
    });
    expect(await runChecks({ type: "video", declaredContentType: "video/mp4", bytes: Buffer.alloc(0) })).toMatchObject({
      verdict: "fail",
    });
    expect(
      await runChecks({
        type: "video",
        declaredContentType: "video/mp4",
        bytes: mp4(10),
        env: { MEDIA_MAX_VIDEO_BYTES: "20" },
      }),
    ).toMatchObject({ verdict: "fail" });
    expect(await runChecks({ type: "video", declaredContentType: "__proto__", bytes: mp4(10) })).toMatchObject({
      verdict: "fail",
    });
  });

  it("fails closed when the probe cannot verify a video duration", async () => {
    const probe = { probe: async () => ({ ok: true as const, durationSec: null }) };
    expect(await runChecks({ type: "video", declaredContentType: "video/mp4", bytes: mp4(10), probe })).toMatchObject({
      verdict: "fail",
    });
  });
});

// ---- pipeline + worker -------------------------------------------------------

let dir: string;
beforeEach(async () => {
  delete process.env.DATABASE_URL;
  dir = await mkdtemp(path.join(tmpdir(), "media-pipeline-"));
  process.env.LOCAL_STORAGE_DIR = dir;
  resetMemoryMedia();
});
afterEach(async () => {
  delete process.env.LOCAL_STORAGE_DIR;
  await rm(dir, { recursive: true, force: true });
});

/** Creates a record the way upload+complete leave it: status=processing / pending. */
async function seed(bytes: Uint8Array, contentType: string, type: "video" | "image" = "video") {
  const m = await createMedia({ ownerId: "u1", type, visibility: "public", format: contentType });
  const key = `media/u1/${m.id}/original.${contentType.split("/")[1]}`;
  await getStorage().put(key, bytes, { contentType });
  await setMediaAsset(m.id, { kind: "original", storageKey: key, contentType, sizeBytes: bytes.length });
  await updateMedia(m.id, { status: "processing", processingStatus: "pending", sizeBytes: bytes.length });
  return m.id;
}

describe("processMedia", () => {
  it("publishes a valid short video: live, ready, publishedAt, passthrough web asset, verified duration", async () => {
    const id = await seed(mp4(30), "video/mp4");
    expect(await processMedia(id)).toBe("live");
    const m = (await getMedia(id))!;
    expect(m).toMatchObject({
      status: "live",
      processingStatus: "ready",
      processingError: null,
      flagReason: null,
      flaggedAt: null,
      durationSec: 30,
    });
    expect(m.publishedAt).toBeInstanceOf(Date);
    const original = m.assets.find((a) => a.kind === "original")!;
    const web = m.assets.find((a) => a.kind === "web")!;
    expect(web).toMatchObject({ storageKey: original.storageKey, contentType: "video/mp4" });
    expect(m.assets.some((a) => a.kind === "thumbnail")).toBe(false);
  });

  it("fails a video over 5 minutes: never live, error recorded, no web asset", async () => {
    const id = await seed(mp4(301), "video/mp4");
    expect(await processMedia(id)).toBe("failed");
    const m = (await getMedia(id))!;
    expect(m).toMatchObject({ status: "draft", processingStatus: "failed", publishedAt: null });
    expect(m.processingError).toMatch(/minute/);
    expect(m.assets.some((a) => a.kind === "web")).toBe(false);
  });

  it("fails wrong magic bytes, corrupt container and a corrupt image", async () => {
    const wrongMagic = await seed(webm(10), "video/mp4");
    const truncated = await seed(mp4(10).subarray(0, 40), "video/mp4");
    const badImage = await seed(png().subarray(0, 20), "image/png", "image");
    for (const id of [wrongMagic, truncated, badImage]) {
      expect(await processMedia(id)).toBe("failed");
      expect(await getMedia(id)).toMatchObject({ status: "draft", processingStatus: "failed", publishedAt: null });
      expect((await getMedia(id))!.processingError).toBeTruthy();
    }
  });

  it("publishes a valid image", async () => {
    const id = await seed(jpeg(), "image/jpeg", "image");
    expect(await processMedia(id)).toBe("live");
    expect(await getMedia(id)).toMatchObject({ status: "live", processingStatus: "ready", durationSec: null });
  });

  it("publishes a near-cap video live AND flags it for review", async () => {
    const id = await seed(mp4(290), "video/mp4");
    expect(await processMedia(id)).toBe("flagged");
    const m = (await getMedia(id))!;
    expect(m).toMatchObject({ status: "live", processingStatus: "ready" });
    expect(m.flagReason).toMatch(/near_duration_cap/);
    expect(m.flaggedAt).toBeInstanceOf(Date);
    expect(m.publishedAt).toBeInstanceOf(Date);
    expect(m.assets.some((a) => a.kind === "web")).toBe(true);
  });

  it("keeps an upload-supplied thumbnail untouched", async () => {
    const id = await seed(mp4(10), "video/mp4");
    await setMediaAsset(id, { kind: "thumbnail", storageKey: "media/u1/t.png", contentType: "image/png", sizeBytes: 5 });
    await processMedia(id);
    expect((await getMedia(id))!.assets.find((a) => a.kind === "thumbnail")?.storageKey).toBe("media/u1/t.png");
  });

  it("fails when the original bytes are missing from storage", async () => {
    const id = await seed(mp4(10), "video/mp4");
    const key = (await getMedia(id))!.assets[0].storageKey;
    await getStorage().delete(key);
    expect(await processMedia(id)).toBe("failed");
    expect((await getMedia(id))!.processingError).toMatch(/missing|not found/i);
  });

  it("marks the item failed (does not throw) when processing crashes", async () => {
    const id = await seed(mp4(10), "video/mp4");
    const boom = {
      probe: async () => {
        throw new Error("probe exploded");
      },
    };
    expect(await processMedia(id, { probe: boom })).toBe("failed");
    const m = (await getMedia(id))!;
    expect(m).toMatchObject({ status: "draft", processingStatus: "failed", publishedAt: null });
    expect(m.processingError).toMatch(/probe exploded/);
  });

  it("skips records that are not pending (idempotent) and unknown ids", async () => {
    const id = await seed(mp4(10), "video/mp4");
    await processMedia(id);
    const before = (await getMedia(id))!;
    expect(await processMedia(id)).toBe("skipped");
    expect(await getMedia(id)).toEqual(before);
    expect(await processMedia("missing")).toBe("skipped");
  });
});

describe("enqueueMediaProcessing (seam)", () => {
  it("runs the pipeline inline and never throws, even on failure", async () => {
    const ok = await seed(mp4(10), "video/mp4");
    await enqueueMediaProcessing(ok);
    expect((await getMedia(ok))!.status).toBe("live");

    const bad = await seed(Buffer.from("garbage bytes here"), "video/mp4");
    await expect(enqueueMediaProcessing(bad)).resolves.toBeUndefined();
    expect((await getMedia(bad))!.processingStatus).toBe("failed");
  });
});

describe("media worker (standalone run over pending items)", () => {
  it("processes a mix of pending items and reports a summary", async () => {
    const good = await seed(mp4(15), "video/mp4");
    const tooLong = await seed(mp4(400), "video/mp4");
    const borderline = await seed(webm(295), "video/webm");
    const img = await seed(png(), "image/png", "image");
    const corrupt = await seed(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg", "image");
    const draft = await createMedia({ ownerId: "u1", type: "video", visibility: "public" });

    expect(await listPendingMedia()).toHaveLength(5);
    const summary = await runPendingMedia();
    expect(summary).toEqual({ processed: 5, live: 2, flagged: 1, failed: 2, skipped: 0, reclaimed: 0 });

    expect((await getMedia(good))!.status).toBe("live");
    expect((await getMedia(tooLong))!.processingStatus).toBe("failed");
    expect((await getMedia(borderline))).toMatchObject({ status: "live", flagReason: expect.any(String) });
    expect((await getMedia(img))!.status).toBe("live");
    expect((await getMedia(corrupt))!.processingStatus).toBe("failed");
    expect((await getMedia(draft.id))!.status).toBe("draft"); // untouched
    expect(await listPendingMedia()).toHaveLength(0);

    expect(await runPendingMedia()).toEqual({ processed: 0, live: 0, flagged: 0, failed: 0, skipped: 0, reclaimed: 0 });
  });

  it("one crashing item does not stop the rest", async () => {
    const a = await seed(mp4(10), "video/mp4");
    const b = await seed(mp4(11), "video/mp4");
    let calls = 0;
    const flaky = {
      probe: async (bytes: Uint8Array, type: string) => {
        if (++calls === 1) throw new Error("first one dies");
        return containerProbe.probe(bytes, type);
      },
    };
    const summary = await runPendingMedia({ probe: flaky });
    expect(summary).toMatchObject({ processed: 2, live: 1, failed: 1 });
    expect((await getMedia(a))!.processingStatus).toBe("failed");
    expect((await getMedia(b))!.status).toBe("live");
  });
});

describe("media worker: stale processing reclaim", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  const mk = async (status: "processing" | "live", ps: "processing" | "ready", at: Date) => {
    const m = await createMedia({ ownerId: "u1", type: "video", visibility: "public" });
    await updateMedia(m.id, { status, processingStatus: ps });
    setMemoryTimestamps(m.id, at);
    return m.id;
  };

  it("fails stale processing items, leaves fresh and live ones alone", async () => {
    const stale = await mk("processing", "processing", ago(16));
    const fresh = await mk("processing", "processing", ago(5));
    const live = await mk("live", "ready", ago(600));
    const summary = await runPendingMedia({ now });
    expect(summary.reclaimed).toBe(1);
    expect(await getMedia(stale)).toMatchObject({
      status: "draft",
      processingStatus: "failed",
      processingError: "processing interrupted — please retry",
    });
    expect(await getMedia(fresh)).toMatchObject({ status: "processing", processingStatus: "processing" });
    expect(await getMedia(live)).toMatchObject({ status: "live", processingStatus: "ready" });
  });

  it("honors MEDIA_PROCESSING_STALE_MINUTES", async () => {
    const id = await mk("processing", "processing", ago(5));
    expect((await runPendingMedia({ now, env: { MEDIA_PROCESSING_STALE_MINUTES: "3" } })).reclaimed).toBe(1);
    expect((await getMedia(id))?.processingStatus).toBe("failed");
  });
});
