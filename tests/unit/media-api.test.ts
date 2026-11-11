import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));
const enqueue = vi.fn(async (id: string) => {
  void id;
});
vi.mock("@/lib/media/processing", () => ({
  enqueueMediaProcessing: (id: string) => enqueue(id),
}));

import { GET as list, POST as init } from "@/app/api/media/route";
import { DELETE as del, GET as getOne, PATCH as patch } from "@/app/api/media/[id]/route";
import { PUT as upload } from "@/app/api/media/[id]/upload/route";
import { POST as complete } from "@/app/api/media/[id]/complete/route";
import { getStorage } from "@/lib/media/storage";
import { getMedia, resetMemoryMedia } from "@/lib/media/records";

const as = (id: string | null, role = "creator") =>
  getSession.mockResolvedValue(id ? { user: { id, role } } : null);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, body: unknown) =>
  new Request("http://x/api/media", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const plain = (method = "GET") => new Request("http://x/api/media", { method });
const initBody = { contentType: "video/mp4", sizeBytes: 4, title: "clip", visibility: "public" };

async function createDraft(body: Record<string, unknown> = initBody) {
  const res = await init(json("POST", body));
  return { res, data: await res.json() };
}
const put = (id: string, bytes: Uint8Array, type = "video/mp4") =>
  upload(
    new Request(`http://x/api/media/${id}/upload`, {
      method: "PUT",
      headers: { "content-type": type },
      body: bytes as unknown as BodyInit,
    }),
    ctx(id),
  );

let dir: string;
beforeEach(async () => {
  delete process.env.DATABASE_URL;
  dir = await mkdtemp(path.join(tmpdir(), "media-api-"));
  process.env.LOCAL_STORAGE_DIR = dir;
  delete process.env.MEDIA_MAX_VIDEO_BYTES;
  resetMemoryMedia();
  enqueue.mockClear();
  as("u1");
});
afterEach(async () => {
  delete process.env.LOCAL_STORAGE_DIR;
  delete process.env.MEDIA_MAX_VIDEO_BYTES;
  await rm(dir, { recursive: true, force: true });
});

describe("auth", () => {
  it("401s every endpoint without a session", async () => {
    as(null);
    expect((await list()).status).toBe(401);
    expect((await init(json("POST", initBody))).status).toBe(401);
    expect((await getOne(plain(), ctx("a"))).status).toBe(401);
    expect((await patch(json("PATCH", { title: "x" }), ctx("a"))).status).toBe(401);
    expect((await del(plain("DELETE"), ctx("a"))).status).toBe(401);
    expect((await put("a", new Uint8Array([1]))).status).toBe(401);
    expect((await complete(plain("POST"), ctx("a"))).status).toBe(401);
  });
});

describe("POST /api/media (init)", () => {
  it("creates a draft and returns the upload target", async () => {
    const { res, data } = await createDraft();
    expect(res.status).toBe(201);
    expect(data.media).toMatchObject({ status: "draft", processingStatus: "pending", ownerId: "u1" });
    expect(data.upload).toEqual({
      method: "PUT",
      url: `/api/media/${data.media.id}/upload`,
      headers: { "content-type": "video/mp4" },
    });
  });

  it("400s on invalid metadata", async () => {
    expect((await createDraft({ ...initBody, visibility: undefined })).res.status).toBe(400);
    expect((await createDraft({ ...initBody, unlockPriceCents: 5 })).res.status).toBe(400);
    expect((await createDraft({ ...initBody, contentType: "application/zip" })).res.status).toBe(415);
  });

  it("413s when declared size exceeds the cap", async () => {
    process.env.MEDIA_MAX_VIDEO_BYTES = "3";
    expect((await createDraft()).res.status).toBe(413);
  });

  it("400s on malformed JSON", async () => {
    const res = await init(new Request("http://x", { method: "POST", body: "{nope" }));
    expect(res.status).toBe(400);
  });
});

describe("upload + complete", () => {
  it("stores bytes via storage adapter and moves to processing/pending, never live", async () => {
    const { data } = await createDraft();
    const id = data.media.id;
    expect((await put(id, new Uint8Array([1, 2, 3, 4]))).status).toBe(200);
    const rec = await getMedia(id);
    const original = rec!.assets.find((a) => a.kind === "original")!;
    expect(original.storageKey).toContain(id);
    expect(await getStorage().exists(original.storageKey)).toBe(true);

    const res = await complete(plain("POST"), ctx(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.media).toMatchObject({ status: "processing", processingStatus: "pending", sizeBytes: 4 });
    expect(body.media.publishedAt).toBeNull();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(id);
    expect(JSON.stringify(body)).not.toContain("storageKey");
  });

  it("rejects complete with no uploaded bytes and a repeated complete", async () => {
    const { data } = await createDraft();
    const id = data.media.id;
    expect((await complete(plain("POST"), ctx(id))).status).toBe(409);
    await put(id, new Uint8Array([1]));
    expect((await complete(plain("POST"), ctx(id))).status).toBe(200);
    expect((await complete(plain("POST"), ctx(id))).status).toBe(409);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong content-type, oversize bytes, and empty bodies", async () => {
    const { data } = await createDraft();
    const id = data.media.id;
    expect((await put(id, new Uint8Array([1]), "video/webm")).status).toBe(415);
    expect((await put(id, new Uint8Array(0))).status).toBe(400);
    process.env.MEDIA_MAX_VIDEO_BYTES = "2";
    expect((await put(id, new Uint8Array([1, 2, 3]))).status).toBe(413);
    expect((await getMedia(id))!.assets).toEqual([]);
  });

  it("refuses upload after the item left draft", async () => {
    const { data } = await createDraft();
    const id = data.media.id;
    await put(id, new Uint8Array([1]));
    await complete(plain("POST"), ctx(id));
    expect((await put(id, new Uint8Array([9]))).status).toBe(409);
  });

  it("404s for another user's item", async () => {
    const { data } = await createDraft();
    const id = data.media.id;
    as("u2");
    expect((await put(id, new Uint8Array([1]))).status).toBe(404);
    expect((await complete(plain("POST"), ctx(id))).status).toBe(404);
  });
});

describe("list / get / patch / delete", () => {
  it("lists only own items", async () => {
    await createDraft();
    as("u2");
    await createDraft();
    const { media } = await (await list()).json();
    expect(media).toHaveLength(1);
    expect(media[0].ownerId).toBe("u2");
  });

  it("gets own item, 404 for others", async () => {
    const { data } = await createDraft();
    expect((await getOne(plain(), ctx(data.media.id))).status).toBe(200);
    as("u2");
    expect((await getOne(plain(), ctx(data.media.id))).status).toBe(404);
  });

  it("patches visibility/price with validation and never status", async () => {
    const { data } = await createDraft();
    const id = data.media.id;
    let res = await patch(json("PATCH", { visibility: "private", unlockPriceCents: 500 }), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).media).toMatchObject({ visibility: "private", unlockPriceCents: 500 });
    res = await patch(json("PATCH", { visibility: "public", unlockPriceCents: 500 }), ctx(id));
    expect(res.status).toBe(400);
    res = await patch(json("PATCH", { visibility: "public" }), ctx(id));
    expect((await res.json()).media).toMatchObject({ visibility: "public", unlockPriceCents: null });
    res = await patch(json("PATCH", { status: "live" }), ctx(id));
    expect(res.status).toBe(400);
    expect((await getMedia(id))!.status).toBe("draft");
  });

  it("does not let others patch an item", async () => {
    const { data } = await createDraft();
    as("u2");
    expect((await patch(json("PATCH", { title: "x" }), ctx(data.media.id))).status).toBe(404);
  });

  it("deletes record and stored bytes; not others'", async () => {
    const { data } = await createDraft();
    const id = data.media.id;
    await put(id, new Uint8Array([1]));
    const key = (await getMedia(id))!.assets[0].storageKey;
    as("u2");
    expect((await del(plain("DELETE"), ctx(id))).status).toBe(404);
    as("u1");
    expect((await del(plain("DELETE"), ctx(id))).status).toBe(200);
    expect(await getMedia(id)).toBeNull();
    expect(await getStorage().exists(key)).toBe(false);
  });
});
