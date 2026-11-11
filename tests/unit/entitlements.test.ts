import { beforeEach, describe, expect, it } from "vitest";
import {
  computeTerm,
  entitlementCoversMedia,
  hasMediaAccess,
  hasValidEntitlementFor,
  isEntitlementValid,
} from "@/lib/payments/entitlements";
import { createEntitlement, resetMemoryPayments, type EntitlementRecord } from "@/lib/payments/records";
import type { MediaRecord } from "@/lib/media/records";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-15T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

function ent(over: Partial<EntitlementRecord> = {}): EntitlementRecord {
  return {
    id: "e1",
    userId: "buyer",
    scope: "creator",
    creatorId: "creator1",
    mediaId: null,
    type: "monthly",
    status: "active",
    startsAt: at(-DAY),
    endsAt: at(DAY),
    createdAt: at(-DAY),
    updatedAt: at(-DAY),
    ...over,
  };
}

const media = (over: Partial<Pick<MediaRecord, "id" | "ownerId" | "status">> = {}) => ({
  id: "m1",
  ownerId: "creator1",
  status: "live" as const,
  ...over,
});

describe("isEntitlementValid", () => {
  it("is valid inside the window", () => {
    expect(isEntitlementValid(ent(), NOW)).toBe(true);
  });
  it("is valid exactly at startsAt", () => {
    expect(isEntitlementValid(ent({ startsAt: NOW }), NOW)).toBe(true);
  });
  it("is invalid before startsAt", () => {
    expect(isEntitlementValid(ent({ startsAt: at(1) }), NOW)).toBe(false);
  });
  it("is invalid exactly at endsAt (exclusive) and after", () => {
    expect(isEntitlementValid(ent({ endsAt: NOW }), NOW)).toBe(false);
    expect(isEntitlementValid(ent({ endsAt: at(-1) }), NOW)).toBe(false);
  });
  it("is valid one ms before endsAt", () => {
    expect(isEntitlementValid(ent({ endsAt: at(1) }), NOW)).toBe(true);
  });
  it("never expires when endsAt is null", () => {
    expect(isEntitlementValid(ent({ type: "one_time", endsAt: null }), at(5000 * DAY))).toBe(true);
  });
  it("is invalid when revoked or expired status", () => {
    expect(isEntitlementValid(ent({ status: "revoked" }), NOW)).toBe(false);
    expect(isEntitlementValid(ent({ status: "expired" }), NOW)).toBe(false);
  });
});

describe("entitlementCoversMedia", () => {
  it("creator scope covers that creator's media only", () => {
    expect(entitlementCoversMedia(ent(), media())).toBe(true);
    expect(entitlementCoversMedia(ent(), media({ ownerId: "other" }))).toBe(false);
  });
  it("media scope covers that media id only", () => {
    const e = ent({ scope: "media", type: "per_video", creatorId: null, mediaId: "m1", endsAt: null });
    expect(entitlementCoversMedia(e, media())).toBe(true);
    expect(entitlementCoversMedia(e, media({ id: "m2" }))).toBe(false);
  });
  it("a media-scope grant does not cover the creator's other media even with matching creatorId", () => {
    const e = ent({ scope: "media", type: "per_video", creatorId: "creator1", mediaId: "m1", endsAt: null });
    expect(entitlementCoversMedia(e, media({ id: "m2" }))).toBe(false);
  });
});

describe("hasValidEntitlementFor", () => {
  it("is true when any valid grant covers the media", () => {
    const list = [ent({ id: "a", status: "revoked" }), ent({ id: "b" })];
    expect(hasValidEntitlementFor(list, media(), NOW)).toBe(true);
  });
  it("is false for empty, invalid or non-covering grants", () => {
    expect(hasValidEntitlementFor([], media(), NOW)).toBe(false);
    expect(hasValidEntitlementFor([ent({ status: "revoked" })], media(), NOW)).toBe(false);
    expect(hasValidEntitlementFor([ent({ endsAt: at(-1) })], media(), NOW)).toBe(false);
    expect(hasValidEntitlementFor([ent({ creatorId: "other" })], media(), NOW)).toBe(false);
  });
});

describe("computeTerm", () => {
  it("monthly lasts 30 days from now when nothing exists", () => {
    expect(computeTerm("monthly", NOW, [])).toEqual({ startsAt: NOW, endsAt: at(30 * DAY) });
  });
  it("yearly lasts 365 days from now when nothing exists", () => {
    expect(computeTerm("yearly", NOW, [])).toEqual({ startsAt: NOW, endsAt: at(365 * DAY) });
  });
  it("one_time and per_video never expire", () => {
    expect(computeTerm("one_time", NOW, [])).toEqual({ startsAt: NOW, endsAt: null });
    expect(computeTerm("per_video", NOW, [])).toEqual({ startsAt: NOW, endsAt: null });
  });
  it("stacks after the latest currently valid timed grant", () => {
    const existing = [ent({ id: "a", endsAt: at(10 * DAY) }), ent({ id: "b", endsAt: at(20 * DAY) })];
    expect(computeTerm("monthly", NOW, existing)).toEqual({
      startsAt: at(20 * DAY),
      endsAt: at(50 * DAY),
    });
  });
  it("stacks after a future-start timed grant", () => {
    const existing = [ent({ startsAt: at(20 * DAY), endsAt: at(50 * DAY) })];
    expect(computeTerm("yearly", NOW, existing)).toEqual({
      startsAt: at(50 * DAY),
      endsAt: at(415 * DAY),
    });
  });
  it("ignores expired, revoked, non-timed and media-scope grants", () => {
    const existing = [
      ent({ id: "a", endsAt: at(-1) }),
      ent({ id: "b", status: "revoked", endsAt: at(40 * DAY) }),
      ent({ id: "c", type: "one_time", endsAt: null }),
      ent({ id: "d", scope: "media", creatorId: null, mediaId: "m1", type: "per_video", endsAt: null }),
    ];
    expect(computeTerm("monthly", NOW, existing)).toEqual({ startsAt: NOW, endsAt: at(30 * DAY) });
  });
  it("one_time / per_video do not stack even with timed grants present", () => {
    const existing = [ent({ endsAt: at(20 * DAY) })];
    expect(computeTerm("one_time", NOW, existing)).toEqual({ startsAt: NOW, endsAt: null });
  });
});

describe("hasMediaAccess (in-memory backing)", () => {
  const liveMedia = (over: Partial<MediaRecord> = {}) => media(over) as MediaRecord;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetMemoryPayments();
  });

  it("is false for an anonymous viewer", async () => {
    expect(await hasMediaAccess(null, liveMedia(), NOW)).toBe(false);
  });

  it("is false without grants", async () => {
    expect(await hasMediaAccess("buyer", liveMedia(), NOW)).toBe(false);
  });

  it("is true for a valid creator-scope grant on a live item", async () => {
    await createEntitlement({
      userId: "buyer",
      scope: "creator",
      creatorId: "creator1",
      type: "monthly",
      startsAt: at(-DAY),
      endsAt: at(DAY),
    });
    expect(await hasMediaAccess("buyer", liveMedia(), NOW)).toBe(true);
    expect(await hasMediaAccess("someone-else", liveMedia(), NOW)).toBe(false);
  });

  it("is true for a per-video grant on that item only", async () => {
    await createEntitlement({
      userId: "buyer",
      scope: "media",
      mediaId: "m1",
      type: "per_video",
      startsAt: at(-DAY),
      endsAt: null,
    });
    expect(await hasMediaAccess("buyer", liveMedia({ id: "m1" }), NOW)).toBe(true);
    expect(await hasMediaAccess("buyer", liveMedia({ id: "m2" }), NOW)).toBe(false);
  });

  it("is false once the grant expired", async () => {
    await createEntitlement({
      userId: "buyer",
      scope: "creator",
      creatorId: "creator1",
      type: "monthly",
      startsAt: at(-31 * DAY),
      endsAt: at(-DAY),
    });
    expect(await hasMediaAccess("buyer", liveMedia(), NOW)).toBe(false);
  });

  it("is false for non-live media even with a valid grant", async () => {
    await createEntitlement({
      userId: "buyer",
      scope: "creator",
      creatorId: "creator1",
      type: "one_time",
      startsAt: at(-DAY),
      endsAt: null,
    });
    for (const status of ["draft", "processing", "flagged", "removed"] as const) {
      expect(await hasMediaAccess("buyer", liveMedia({ status }), NOW)).toBe(false);
    }
  });
});
