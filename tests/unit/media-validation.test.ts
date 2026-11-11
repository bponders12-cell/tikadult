import { describe, expect, it } from "vitest";
import { validateInit, validateUpdate } from "@/lib/media/validation";
import { maxUploadBytes } from "@/lib/media/config";

const base = {
  contentType: "video/mp4",
  sizeBytes: 1000,
  title: "My clip",
  visibility: "public",
};

const publicFree = { visibility: "public", unlockPriceCents: null } as const;

describe("maxUploadBytes", () => {
  it("defaults to ~300MB video / ~10MB image and is env-configurable", () => {
    expect(maxUploadBytes("video", {})).toBe(300 * 1024 * 1024);
    expect(maxUploadBytes("image", {})).toBe(10 * 1024 * 1024);
    expect(maxUploadBytes("video", { MEDIA_MAX_VIDEO_BYTES: "5000" })).toBe(5000);
    expect(maxUploadBytes("image", { MEDIA_MAX_IMAGE_BYTES: "bogus" })).toBe(10 * 1024 * 1024);
  });
});

describe("validateInit", () => {
  it("accepts a minimal public video", () => {
    const r = validateInit(base, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        type: "video",
        contentType: "video/mp4",
        visibility: "public",
        unlockPriceCents: null,
        categorySlug: null,
        durationSec: null,
      });
    }
  });

  it("derives image type and accepts private with price", () => {
    const r = validateInit(
      { ...base, contentType: "image/png", visibility: "private", unlockPriceCents: 499 },
      {},
    );
    expect(r.ok && r.value.type).toBe("image");
    expect(r.ok && r.value.unlockPriceCents).toBe(499);
  });

  it.each([
    ["non-object body", "nope"],
    ["unknown format", { ...base, contentType: "video/x-msvideo" }],
    ["missing visibility", { ...base, visibility: undefined }],
    ["invalid visibility", { ...base, visibility: "friends" }],
    ["unknown category", { ...base, categorySlug: "nope" }],
    ["too-long title", { ...base, title: "x".repeat(151) }],
    ["non-string title", { ...base, title: 5 }],
    ["zero size", { ...base, sizeBytes: 0 }],
    ["fractional size", { ...base, sizeBytes: 1.5 }],
    ["negative price", { ...base, visibility: "private", unlockPriceCents: -1 }],
    ["fractional price", { ...base, visibility: "private", unlockPriceCents: 1.5 }],
    ["string price", { ...base, visibility: "private", unlockPriceCents: "5" }],
    ["price on public", { ...base, unlockPriceCents: 100 }],
    ["negative duration", { ...base, durationSec: -3 }],
    ["type mismatch", { ...base, type: "image" }],
  ])("rejects %s", (_name, body) => {
    expect(validateInit(body, {}).ok).toBe(false);
  });

  it("rejects files over the size cap", () => {
    const env = { MEDIA_MAX_VIDEO_BYTES: "5000" };
    expect(validateInit({ ...base, sizeBytes: 5001 }, env).ok).toBe(false);
    expect(validateInit({ ...base, sizeBytes: 5000 }, env).ok).toBe(true);
  });

  it("flags oversize with a distinct code", () => {
    const r = validateInit({ ...base, sizeBytes: 5001 }, { MEDIA_MAX_VIDEO_BYTES: "5000" });
    expect(!r.ok && r.status).toBe(413);
  });

  it("accepts known category and declared duration", () => {
    const r = validateInit({ ...base, categorySlug: "trending", durationSec: 42 }, {});
    expect(r.ok && r.value.categorySlug).toBe("trending");
    expect(r.ok && r.value.durationSec).toBe(42);
  });

  it("treats null price on restricted as free", () => {
    const r = validateInit({ ...base, visibility: "restricted", unlockPriceCents: null }, {});
    expect(r.ok && r.value.unlockPriceCents).toBe(null);
  });
});

describe("validateUpdate", () => {
  it("clears price when switching to public without a price", () => {
    const r = validateUpdate(
      { visibility: "public" },
      { visibility: "private", unlockPriceCents: 300 },
    );
    expect(r.ok && r.value).toMatchObject({ visibility: "public", unlockPriceCents: null });
  });

  it("rejects public + price", () => {
    expect(
      validateUpdate(
        { visibility: "public", unlockPriceCents: 5 },
        { visibility: "private", unlockPriceCents: null },
      ).ok,
    ).toBe(false);
  });

  it("rejects setting a price on an already-public item", () => {
    expect(validateUpdate({ unlockPriceCents: 5 }, publicFree).ok).toBe(false);
  });

  it("keeps current price when only the title changes", () => {
    const r = validateUpdate({ title: "New" }, { visibility: "private", unlockPriceCents: 300 });
    expect(r.ok && r.value).toEqual({ title: "New" });
  });

  it("validates category and title", () => {
    expect(validateUpdate({ categorySlug: "zzz" }, publicFree).ok).toBe(false);
    expect(validateUpdate({ title: "y".repeat(200) }, publicFree).ok).toBe(false);
    const r = validateUpdate({ categorySlug: null }, publicFree);
    expect(r.ok && r.value.categorySlug).toBe(null);
  });

  it("rejects empty or unknown-only patches", () => {
    expect(validateUpdate({}, publicFree).ok).toBe(false);
    expect(validateUpdate({ status: "live" }, publicFree).ok).toBe(false);
  });
});
