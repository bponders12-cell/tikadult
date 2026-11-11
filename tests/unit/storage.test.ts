import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

  it("is a contract stub whose operations are not yet implemented", async () => {
    const s = new S3StorageAdapter(s3ConfigFromEnv(full)!);
    await expect(s.get("k")).rejects.toThrow(/not implemented/i);
  });

  it("getStorage picks s3 when configured, local otherwise", () => {
    expect(getStorage({})).toBeInstanceOf(LocalStorageAdapter);
    expect(getStorage(full)).toBeInstanceOf(S3StorageAdapter);
  });
});
