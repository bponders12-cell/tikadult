import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocalStorageAdapter,
  S3StorageAdapter,
  getStorage,
  s3ConfigFromEnv,
} from "@/lib/media/storage";
import { MAX_VIDEO_DURATION_SEC } from "@/lib/media/config";

describe("media config", () => {
  it("caps video length at 5 minutes", () => {
    expect(MAX_VIDEO_DURATION_SEC).toBe(300);
  });
});

describe("LocalStorageAdapter", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "storage-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("round-trips put/get/exists/delete with nested keys", async () => {
    const s = new LocalStorageAdapter(root);
    const key = "media/abc/original.mp4";
    expect(await s.exists(key)).toBe(false);
    expect(await s.get(key)).toBeNull();
    await s.put(key, Buffer.from("hello"), { contentType: "video/mp4" });
    expect(await s.exists(key)).toBe(true);
    expect((await s.get(key))?.toString()).toBe("hello");
    await s.delete(key);
    expect(await s.exists(key)).toBe(false);
    await s.delete(key); // idempotent
  });

  it("rejects keys that escape the root", async () => {
    const s = new LocalStorageAdapter(root);
    await expect(s.put("../evil", Buffer.from("x"))).rejects.toThrow(/invalid storage key/i);
    await expect(s.get("/abs/path")).rejects.toThrow(/invalid storage key/i);
    await expect(s.exists("a/../../b")).rejects.toThrow(/invalid storage key/i);
  });
});

describe("S3 adapter + factory", () => {
  const full = {
    S3_ENDPOINT: "https://s3.example.com",
    S3_BUCKET: "bkt",
    S3_ACCESS_KEY_ID: "ak",
    S3_SECRET_ACCESS_KEY: "sk",
  };

  it("reads config purely from env", () => {
    expect(s3ConfigFromEnv(full)).toMatchObject({
      endpoint: "https://s3.example.com",
      bucket: "bkt",
      accessKeyId: "ak",
      secretAccessKey: "sk",
    });
    expect(s3ConfigFromEnv({})).toBeNull();
    expect(() => s3ConfigFromEnv({ S3_BUCKET: "b" })).toThrow(/S3_ENDPOINT/);
  });

  it("getStorage picks s3 when configured, local otherwise", () => {
    expect(getStorage({})).toBeInstanceOf(LocalStorageAdapter);
    expect(getStorage(full)).toBeInstanceOf(S3StorageAdapter);
  });

  describe("S3StorageAdapter operations", () => {
    const cfg = s3ConfigFromEnv(full)!;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("put issues signed PUT to path-style endpoint with auth and payload hash", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "" });
      const s = new S3StorageAdapter(cfg);
      await s.put("media/a/file.bin", Buffer.from("hello"), { contentType: "application/octet-stream" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://s3.example.com/bkt/media/a/file.bin");
      expect(init.method).toBe("PUT");
      expect(init.headers.authorization || init.headers.Authorization).toContain("AWS4-HMAC-SHA256");
      expect(init.headers["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
      expect(init.headers["content-type"] || init.headers["Content-Type"]).toBe("application/octet-stream");
    });

    it("get returns Buffer on 200 and null on 404", async () => {
      const s = new S3StorageAdapter(cfg);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([104, 101, 108, 108, 111]).buffer,
      });
      const buf = await s.get("k1");
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf?.toString()).toBe("hello");

      fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "no" });
      expect(await s.get("missing")).toBeNull();
    });

    it("exists returns true/false on HEAD 200/404", async () => {
      const s = new S3StorageAdapter(cfg);
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
      expect(await s.exists("k")).toBe(true);
      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe("HEAD");

      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
      expect(await s.exists("missing")).toBe(false);
    });

    it("delete resolves on 204 and 404 (idempotent) and rejects on 500", async () => {
      const s = new S3StorageAdapter(cfg);
      fetchMock.mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" });
      await expect(s.delete("k")).resolves.toBeUndefined();
      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");

      fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "" });
      await expect(s.delete("missing")).resolves.toBeUndefined();

      fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "err" });
      await expect(s.delete("boom")).rejects.toThrow();
    });

    it("rejects unsafe keys before calling fetch", async () => {
      const s = new S3StorageAdapter(cfg);
      await expect(s.get("../evil")).rejects.toThrow(/invalid storage key/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
