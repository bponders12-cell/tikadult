import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));
const categoryFind = vi.fn();
const mediaCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    category: { findUnique: (a: unknown) => categoryFind(a) },
    media: { create: (a: unknown) => mediaCreate(a) },
  },
}));

import { POST as init } from "@/app/api/media/route";
import { PUT as upload } from "@/app/api/media/[id]/upload/route";
import { validateInit } from "@/lib/media/validation";
import { mediaTypeForContentType } from "@/lib/media/config";
import { createMedia, resetMemoryMedia, UnknownCategoryError } from "@/lib/media/records";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const body = { contentType: "video/mp4", sizeBytes: 4, visibility: "public" };

let dir: string;
beforeEach(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.MEDIA_MAX_VIDEO_BYTES;
  dir = await mkdtemp(path.join(tmpdir(), "media-hard-"));
  process.env.LOCAL_STORAGE_DIR = dir;
  resetMemoryMedia();
  getSession.mockResolvedValue({ user: { id: "u1", role: "creator" } });
  categoryFind.mockReset();
  mediaCreate.mockReset();
});
afterEach(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.LOCAL_STORAGE_DIR;
  delete process.env.MEDIA_MAX_VIDEO_BYTES;
  await rm(dir, { recursive: true, force: true });
});

describe("allowlist prototype keys", () => {
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])("rejects %s", (k) => {
    expect(mediaTypeForContentType(k)).toBeNull();
    const r = validateInit({ ...body, contentType: k }, {});
    expect(!r.ok && r.status).toBe(415);
  });

  it("PUT rejects a prototype-key content-type", async () => {
    const res = await init(
      new Request("http://x", { method: "POST", body: JSON.stringify(body) }),
    );
    const id = (await res.json()).media.id;
    const put = await upload(
      new Request("http://x", { method: "PUT", headers: { "content-type": "constructor" }, body: new Uint8Array([1]) }),
      ctx(id),
    );
    expect(put.status).toBe(415);
  });
});

describe("category absent from DB", () => {
  it("createMedia throws UnknownCategoryError instead of dropping the category", async () => {
    process.env.DATABASE_URL = "postgres://x";
    categoryFind.mockResolvedValue(null);
    await expect(
      createMedia({ ownerId: "u1", type: "video", visibility: "public", categorySlug: "new" }),
    ).rejects.toBeInstanceOf(UnknownCategoryError);
    expect(mediaCreate).not.toHaveBeenCalled();
  });

  it("POST /api/media returns 400 for it", async () => {
    process.env.DATABASE_URL = "postgres://x";
    categoryFind.mockResolvedValue(null);
    const res = await init(
      new Request("http://x", { method: "POST", body: JSON.stringify({ ...body, categorySlug: "new" }) }),
    );
    expect(res.status).toBe(400);
  });
});

describe("streamed upload cap", () => {
  function streamed(chunks: Uint8Array[]) {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        chunks.forEach((x) => c.enqueue(x));
        c.close();
      },
    });
    return new Request("http://x", {
      method: "PUT",
      headers: { "content-type": "video/mp4" },
      body: stream,
      duplex: "half",
    } as RequestInit);
  }
  async function draft() {
    const res = await init(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
    return (await res.json()).media.id as string;
  }

  it("413s a chunked body with no content-length that exceeds the cap", async () => {
    process.env.MEDIA_MAX_VIDEO_BYTES = "4";
    const id = await draft();
    const req = streamed([new Uint8Array(3), new Uint8Array(3)]);
    expect(req.headers.get("content-length")).toBeNull();
    expect((await upload(req, ctx(id))).status).toBe(413);
  });

  it("accepts a chunked body within the cap", async () => {
    process.env.MEDIA_MAX_VIDEO_BYTES = "10";
    const id = await draft();
    const res = await upload(streamed([new Uint8Array([1, 2]), new Uint8Array([3])]), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).sizeBytes).toBe(3);
  });
});
