import { beforeEach, describe, expect, it } from "vitest";
import {
  createMedia,
  deleteMedia,
  getMedia,
  listMediaByOwner,
  resetMemoryMedia,
  setMediaAsset,
  updateMedia,
} from "@/lib/media/records";

describe("media records (in-memory backing)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetMemoryMedia();
  });

  it("creates a draft/pending record with defaults", async () => {
    const m = await createMedia({
      ownerId: "u1",
      type: "video",
      visibility: "private",
      unlockPriceCents: 250,
      title: "t",
      categorySlug: "new",
      format: "video/mp4",
      sizeBytes: 10,
      durationSec: 12,
    });
    expect(m.id).toBeTruthy();
    expect(m).toMatchObject({
      ownerId: "u1",
      status: "draft",
      processingStatus: "pending",
      visibility: "private",
      unlockPriceCents: 250,
      categorySlug: "new",
      publishedAt: null,
      assets: [],
    });
    expect(await getMedia(m.id)).toEqual(m);
  });

  it("lists only the owner's items, newest first", async () => {
    const a = await createMedia({ ownerId: "u1", type: "video", visibility: "public" });
    await new Promise((r) => setTimeout(r, 3));
    const b = await createMedia({ ownerId: "u1", type: "image", visibility: "public" });
    await createMedia({ ownerId: "u2", type: "video", visibility: "public" });
    const list = await listMediaByOwner("u1");
    expect(list.map((m) => m.id)).toEqual([b.id, a.id]);
  });

  it("updates fields; returns null for unknown id", async () => {
    const m = await createMedia({ ownerId: "u1", type: "video", visibility: "public" });
    const u = await updateMedia(m.id, { status: "processing", title: "x" });
    expect(u).toMatchObject({ status: "processing", title: "x", ownerId: "u1" });
    expect(u!.updatedAt.getTime()).toBeGreaterThanOrEqual(m.updatedAt.getTime());
    expect(await updateMedia("missing", { title: "x" })).toBeNull();
  });

  it("stores one asset per kind (upsert)", async () => {
    const m = await createMedia({ ownerId: "u1", type: "video", visibility: "public" });
    await setMediaAsset(m.id, { kind: "original", storageKey: "k1", contentType: "video/mp4", sizeBytes: 1 });
    await setMediaAsset(m.id, { kind: "original", storageKey: "k2", contentType: "video/mp4", sizeBytes: 2 });
    const got = await getMedia(m.id);
    expect(got!.assets).toEqual([
      { kind: "original", storageKey: "k2", contentType: "video/mp4", sizeBytes: 2 },
    ]);
  });

  it("deletes records", async () => {
    const m = await createMedia({ ownerId: "u1", type: "video", visibility: "public" });
    expect(await deleteMedia(m.id)).toBe(true);
    expect(await getMedia(m.id)).toBeNull();
    expect(await deleteMedia(m.id)).toBe(false);
  });
});
