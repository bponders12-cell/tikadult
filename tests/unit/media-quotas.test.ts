import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/media/processing", () => ({ enqueueMediaProcessing: async () => {} }));

import { POST as init } from "@/app/api/media/route";
import { checkUploadQuota, quotaLimits } from "@/lib/media/quotas";
import {
  clearMediaAssets,
  createMedia,
  getMedia,
  getStorageUsage,
  resetMemoryMedia,
  setMediaAsset,
  updateMedia,
} from "@/lib/media/records";
import { getStorage, LocalStorageAdapter } from "@/lib/media/storage";

const MB = 1024 * 1024;
const json = (body: unknown) =>
  new Request("http://x/api/media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const initBody = { contentType: "video/mp4", sizeBytes: 1000, title: "c", visibility: "public" };
const seed = (ownerId: string, sizeBytes: number) =>
  createMedia({ ownerId, type: "video", visibility: "public", sizeBytes });

let dir: string;
beforeEach(async () => {
  delete process.env.DATABASE_URL;
  dir = await mkdtemp(path.join(tmpdir(), "media-quota-"));
  process.env.LOCAL_STORAGE_DIR = dir;
  resetMemoryMedia();
  getSession.mockResolvedValue({ user: { id: "u1", role: "creator" } });
});
afterEach(async () => {
  for (const k of ["MEDIA_MAX_ITEMS_PER_USER", "MEDIA_MAX_BYTES_PER_USER", "MEDIA_MAX_TOTAL_BYTES"]) {
    delete process.env[k];
  }
  delete process.env.LOCAL_STORAGE_DIR;
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("quotaLimits", () => {
  it("has budget-sized defaults and env overrides, ignoring junk", () => {
    expect(quotaLimits({})).toEqual({
      maxItemsPerUser: 100,
      maxBytesPerUser: 2 * 1024 * MB,
      maxTotalBytes: 50 * 1024 * MB,
    });
    expect(quotaLimits({ MEDIA_MAX_ITEMS_PER_USER: "3", MEDIA_MAX_BYTES_PER_USER: "abc" })).toMatchObject({
      maxItemsPerUser: 3,
      maxBytesPerUser: 2 * 1024 * MB,
    });
  });
});

describe("checkUploadQuota", () => {
  it("allows when under every limit", async () => {
    expect(await checkUploadQuota("u1", 1000, {})).toEqual({ ok: true });
  });

  it("rejects at the per-user item count, counting drafts, naming the limit", async () => {
    await seed("u1", 1);
    await seed("u1", 1);
    const r = await checkUploadQuota("u1", 1, { MEDIA_MAX_ITEMS_PER_USER: "2" });
    expect(r).toMatchObject({ ok: false, status: 429 });
    expect((r as { error: string }).error).toMatch(/2 items/);
  });

  it("ignores removed items and other users", async () => {
    const a = await seed("u1", 1);
    await updateMedia(a.id, { status: "removed" });
    await seed("u2", 1);
    expect(await checkUploadQuota("u1", 1, { MEDIA_MAX_ITEMS_PER_USER: "1" })).toEqual({ ok: true });
  });

  it("rejects when per-user bytes would exceed the cap", async () => {
    await seed("u1", 900);
    const env = { MEDIA_MAX_BYTES_PER_USER: "1000" };
    expect(await checkUploadQuota("u1", 100, env)).toEqual({ ok: true });
    const r = await checkUploadQuota("u1", 101, env);
    expect(r).toMatchObject({ ok: false, status: 429 });
    expect((r as { error: string }).error).toMatch(/storage/i);
  });

  it("rejects on the global ceiling with 503 and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await seed("u2", 950);
    const r = await checkUploadQuota("u1", 100, { MEDIA_MAX_TOTAL_BYTES: "1000" });
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/global storage ceiling/i));
  });
});

describe("POST /api/media quota enforcement", () => {
  it("returns 429 naming the limit before creating a record", async () => {
    process.env.MEDIA_MAX_ITEMS_PER_USER = "1";
    expect((await init(json(initBody))).status).toBe(201);
    const res = await init(json(initBody));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/1 items/);
  });

  it("returns 503 when the global ceiling is hit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.MEDIA_MAX_TOTAL_BYTES = "500";
    const res = await init(json(initBody));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/capacity/i);
  });
});

describe("getStorage in production", () => {
  it("throws a clear config error when S3 is not configured", () => {
    expect(() => getStorage({ NODE_ENV: "production" })).toThrow(/production.*S3_ENDPOINT/i);
  });
  it("still allows local in dev and S3 in production", () => {
    expect(getStorage({ NODE_ENV: "development" })).toBeInstanceOf(LocalStorageAdapter);
    expect(() =>
      getStorage({
        NODE_ENV: "production",
        S3_ENDPOINT: "https://s",
        S3_BUCKET: "b",
        S3_ACCESS_KEY_ID: "a",
        S3_SECRET_ACCESS_KEY: "s",
      }),
    ).not.toThrow();
  });
});

describe("declared size bounds the upload (quota bypass)", () => {
  it("rejects a PUT larger than the declared size, stores nothing, and stays retryable", async () => {
    const { PUT } = await import("@/app/api/media/[id]/upload/route");
    const res = await init(json({ ...initBody, sizeBytes: 4 }));
    const { media } = await res.json();
    const put = (bytes: Uint8Array) =>
      PUT(
        new Request(`http://x/api/media/${media.id}/upload`, {
          method: "PUT",
          headers: { "content-type": "video/mp4" },
          body: bytes as unknown as BodyInit,
        }),
        { params: Promise.resolve({ id: media.id }) },
      );
    const tooBig = await put(new Uint8Array(5));
    expect(tooBig.status).toBe(413);
    expect(await getStorage().exists(`media/u1/${media.id}/original.mp4`)).toBe(false);
    expect((await getMedia(media.id))!.assets).toEqual([]);
    expect((await put(new Uint8Array(4))).status).toBe(200); // retry within the declaration works
  });
});

describe("removed media bytes count until purged", () => {
  it("counts a removed item with assets, not after the purge clears them", async () => {
    const m = await seed("u1", 500);
    await setMediaAsset(m.id, { kind: "original", storageKey: "k", contentType: "video/mp4", sizeBytes: 500 });
    await updateMedia(m.id, { status: "removed" });
    expect(await getStorageUsage("u1")).toEqual({ count: 0, bytes: 500 });
    expect(await getStorageUsage()).toEqual({ count: 0, bytes: 500 });
    const env = { MEDIA_MAX_BYTES_PER_USER: "600" };
    expect(await checkUploadQuota("u1", 200, env)).toMatchObject({ ok: false, status: 429 });
    await clearMediaAssets(m.id);
    expect(await getStorageUsage("u1")).toEqual({ count: 0, bytes: 0 });
    expect(await checkUploadQuota("u1", 200, env)).toEqual({ ok: true });
  });
});
