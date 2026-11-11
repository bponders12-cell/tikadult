import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMediaCleanup } from "@/workers/media-cleanup";
import {
  createMedia,
  getMedia,
  resetMemoryMedia,
  setMediaAsset,
  setMemoryTimestamps,
  updateMedia,
} from "@/lib/media/records";
import { LocalStorageAdapter } from "@/lib/media/storage";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-06-10T12:00:00Z");
let dir: string;
let storage: LocalStorageAdapter;

async function seed(status: "draft" | "removed" | "live" | "processing", ageMs: number) {
  const m = await createMedia({ ownerId: "u1", type: "video", visibility: "public", sizeBytes: 3 });
  const key = `media/u1/${m.id}/original.mp4`;
  await storage.put(key, Buffer.from("abc"));
  await setMediaAsset(m.id, { kind: "original", storageKey: key, contentType: "video/mp4", sizeBytes: 3 });
  if (status === "live") {
    // passthrough: the web asset shares the original's key
    await setMediaAsset(m.id, { kind: "web", storageKey: key, contentType: "video/mp4", sizeBytes: 3 });
  }
  await updateMedia(m.id, { status });
  // updateMedia stamps updatedAt = now, so age the record last.
  setMemoryTimestamps(m.id, new Date(NOW.getTime() - ageMs));
  return { id: m.id, key };
}

beforeEach(async () => {
  delete process.env.DATABASE_URL;
  dir = await mkdtemp(path.join(tmpdir(), "media-clean-"));
  storage = new LocalStorageAdapter(dir);
  resetMemoryMedia();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("runMediaCleanup", () => {
  it("deletes abandoned drafts past the TTL, with their bytes", async () => {
    const old = await seed("draft", 25 * HOUR);
    const fresh = await seed("draft", 2 * HOUR);
    const summary = await runMediaCleanup({ storage, now: NOW });
    expect(summary.draftsDeleted).toBe(1);
    expect(await getMedia(old.id)).toBeNull();
    expect(await storage.exists(old.key)).toBe(false);
    expect(await getMedia(fresh.id)).not.toBeNull();
    expect(await storage.exists(fresh.key)).toBe(true);
  });

  it("honours MEDIA_DRAFT_TTL_HOURS", async () => {
    const m = await seed("draft", 3 * HOUR);
    const s = await runMediaCleanup({ storage, now: NOW, env: { MEDIA_DRAFT_TTL_HOURS: "2" } });
    expect(s.draftsDeleted).toBe(1);
    expect(await getMedia(m.id)).toBeNull();
  });

  it("never touches live or processing items", async () => {
    const live = await seed("live", 400 * DAY);
    const proc = await seed("processing", 400 * DAY);
    const s = await runMediaCleanup({ storage, now: NOW });
    expect(s).toMatchObject({ draftsDeleted: 0, removedPurged: 0 });
    expect(await storage.exists(live.key)).toBe(true);
    expect(await storage.exists(proc.key)).toBe(true);
  });

  it("purges bytes of removed media past retention, keeps the record, and is idempotent", async () => {
    const old = await seed("removed", 31 * DAY);
    const recent = await seed("removed", 5 * DAY);
    const s1 = await runMediaCleanup({ storage, now: NOW });
    expect(s1.removedPurged).toBe(1);
    expect(await storage.exists(old.key)).toBe(false);
    const rec = await getMedia(old.id);
    expect(rec).not.toBeNull();
    expect(rec!.assets).toEqual([]);
    expect(await storage.exists(recent.key)).toBe(true);
    const s2 = await runMediaCleanup({ storage, now: NOW });
    expect(s2.removedPurged).toBe(0);
  });

  it("deletes a shared passthrough key once without error", async () => {
    const m = await seed("removed", 40 * DAY);
    await setMediaAsset(m.id, { kind: "web", storageKey: m.key, contentType: "video/mp4", sizeBytes: 3 });
    setMemoryTimestamps(m.id, new Date(NOW.getTime() - 40 * DAY));
    const s = await runMediaCleanup({ storage, now: NOW });
    expect(s).toMatchObject({ removedPurged: 1, errors: 0 });
    expect(await storage.exists(m.key)).toBe(false);
  });

  it("counts a failing item and continues with the rest", async () => {
    const bad = await seed("draft", 48 * HOUR);
    const good = await seed("draft", 48 * HOUR);
    const flaky = {
      put: storage.put.bind(storage),
      get: storage.get.bind(storage),
      exists: storage.exists.bind(storage),
      delete: async (k: string) => {
        if (k === bad.key) throw new Error("boom");
        return storage.delete(k);
      },
    };
    const s = await runMediaCleanup({ storage: flaky, now: NOW });
    expect(s.errors).toBe(1);
    expect(s.draftsDeleted).toBe(1);
    expect(await getMedia(good.id)).toBeNull();
    expect(await getMedia(bad.id)).not.toBeNull(); // kept so a later run retries
  });
});
