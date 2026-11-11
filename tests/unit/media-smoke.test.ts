import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));

import { POST as init } from "@/app/api/media/route";
import { PUT as upload } from "@/app/api/media/[id]/upload/route";
import { POST as complete } from "@/app/api/media/[id]/complete/route";
import { GET as deliver } from "@/app/api/media/[id]/asset/[kind]/route";
import { getMedia, resetMemoryMedia } from "@/lib/media/records";
import { runPendingMedia } from "@/workers/media-worker";
import { mp4 } from "./helpers/media-fixtures";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let dir: string;
beforeEach(async () => {
  delete process.env.DATABASE_URL;
  dir = await mkdtemp(path.join(tmpdir(), "media-smoke-"));
  process.env.LOCAL_STORAGE_DIR = dir;
  resetMemoryMedia();
  getSession.mockResolvedValue({ user: { id: "creator1", role: "creator" } });
});
afterEach(async () => {
  delete process.env.LOCAL_STORAGE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("pipeline smoke: init -> PUT -> complete -> pipeline -> delivery", () => {
  it("takes a tiny mp4 live and serves it", async () => {
    const bytes = mp4(2);
    const initRes = await init(
      new Request("http://x/api/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentType: "video/mp4",
          sizeBytes: bytes.length,
          title: "smoke",
          visibility: "public",
        }),
      }),
    );
    expect(initRes.status).toBe(201);
    const { media, upload: target } = await initRes.json();
    expect(media.status).toBe("draft");

    const putRes = await upload(
      new Request(`http://x${target.url}`, {
        method: "PUT",
        headers: { "content-type": "video/mp4" },
        body: bytes as unknown as BodyInit,
      }),
      ctx(media.id),
    );
    expect(putRes.status).toBe(200);

    // complete runs the pipeline inline (enqueueMediaProcessing), so the worker has nothing left.
    const done = await complete(new Request("http://x", { method: "POST" }), ctx(media.id));
    expect(done.status).toBe(200);
    expect(await runPendingMedia()).toMatchObject({ processed: 0 });

    const rec = await getMedia(media.id);
    expect(rec).toMatchObject({ status: "live", processingStatus: "ready" });
    expect(rec!.durationSec).toBe(2);

    const res = await deliver(new Request(`http://x/api/media/${media.id}/asset/web`), {
      params: Promise.resolve({ id: media.id, kind: "web" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
  });
});
