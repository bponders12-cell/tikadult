import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPrivateCollectionView, type PrivateCollectionView } from "@/lib/payments/profile-access";
import {
  createMedia,
  listLiveNonPublicByOwner,
  resetMemoryMedia,
  setMediaAsset,
  updateMedia,
  type MediaStatus,
  type MediaVisibility,
} from "@/lib/media/records";
import { resetMemoryPricing, setCreatorPricing } from "@/lib/payments/pricing";
import { createEntitlement, resetMemoryPayments } from "@/lib/payments/records";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-10T12:00:00.000Z");

async function seed(
  opts: { visibility?: MediaVisibility; status?: MediaStatus; price?: number | null; ownerId?: string; title?: string; thumb?: boolean } = {},
) {
  const m = await createMedia({
    ownerId: opts.ownerId ?? "creator1",
    type: "video",
    visibility: opts.visibility ?? "private",
    unlockPriceCents: opts.price === undefined ? 499 : opts.price,
    title: opts.title ?? "Secret",
  });
  await setMediaAsset(m.id, { kind: "web", storageKey: `k/${m.id}`, contentType: "video/mp4", sizeBytes: 1 });
  if (opts.thumb) {
    await setMediaAsset(m.id, { kind: "thumbnail", storageKey: `t/${m.id}`, contentType: "image/jpeg", sizeBytes: 1 });
  }
  await updateMedia(m.id, { status: opts.status ?? "live", publishedAt: new Date() });
  return m;
}

const view = (viewerId: string | null, isOwner = false) =>
  loadPrivateCollectionView("creator1", { id: viewerId, isOwner }, NOW);

/** Every string in the view; locked tiles must not leak an asset URL anywhere. */
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", undefined);
  resetMemoryMedia();
  resetMemoryPayments();
  resetMemoryPricing();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("listLiveNonPublicByOwner", () => {
  it("returns only the owner's live private/restricted items", async () => {
    const a = await seed();
    const b = await seed({ visibility: "restricted" });
    await seed({ visibility: "public" });
    await seed({ status: "draft" });
    await seed({ status: "flagged" });
    await seed({ ownerId: "creator2" });
    expect((await listLiveNonPublicByOwner("creator1")).map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("loadPrivateCollectionView", () => {
  it("locks every item for an anonymous viewer, without any asset URL", async () => {
    const priced = await seed({ title: "Priced", thumb: true });
    const free = await seed({ title: "", price: null, thumb: true });
    const zero = await seed({ price: 0 });
    const v = await view(null);
    const byId = Object.fromEntries(v.tiles.map((t) => [t.id, t]));
    expect(byId[priced.id]).toEqual({
      kind: "locked",
      id: priced.id,
      title: "Priced",
      priceCents: 499,
      checkoutHref: `/checkout?type=per_video&media=${priced.id}`,
    });
    expect(byId[free.id]).toEqual({ kind: "locked", id: free.id, title: "Untitled", priceCents: null, checkoutHref: null });
    expect(byId[zero.id]).toMatchObject({ kind: "locked", priceCents: null, checkoutHref: null });
    expect(strings(v).some((s) => s.includes("/api/media/"))).toBe(false);
  });

  it("skips items without a playable web asset", async () => {
    const m = await createMedia({ ownerId: "creator1", type: "video", visibility: "private" });
    await updateMedia(m.id, { status: "live" });
    expect((await view(null)).tiles).toEqual([]);
  });

  it("unlocks everything for the owner and offers nothing", async () => {
    await setCreatorPricing("creator1", { monthlyPriceCents: 500, yearlyPriceCents: 5000, oneTimePriceCents: 9900 });
    const m = await seed({ thumb: true });
    const v = await view("creator1", true);
    expect(v.tiles).toEqual([
      {
        kind: "unlocked",
        id: m.id,
        title: "Secret",
        type: "video",
        webSrc: `/api/media/${m.id}/asset/web`,
        thumbnailSrc: `/api/media/${m.id}/asset/thumbnail`,
      },
    ]);
    expect(v.offers).toEqual([]);
    expect(v.accessUntil).toBeNull();
  });

  it("unlocks only the purchased item for a per-video grant", async () => {
    const bought = await seed();
    const other = await seed();
    await createEntitlement({ userId: "fan", scope: "media", mediaId: bought.id, type: "per_video", startsAt: NOW, endsAt: null });
    const kinds = Object.fromEntries((await view("fan")).tiles.map((t) => [t.id, t.kind]));
    expect(kinds).toEqual({ [bought.id]: "unlocked", [other.id]: "locked" });
  });

  it("unlocks all items for a valid collection grant and shows the access end", async () => {
    await setCreatorPricing("creator1", { monthlyPriceCents: 500, yearlyPriceCents: null, oneTimePriceCents: 9900 });
    await seed();
    await seed({ visibility: "restricted" });
    const end = new Date(NOW.getTime() + 10 * DAY);
    await createEntitlement({ userId: "fan", scope: "creator", creatorId: "creator1", type: "monthly", startsAt: new Date(NOW.getTime() - 20 * DAY), endsAt: end });
    // A stacked future term extends the shown date.
    const stacked = new Date(end.getTime() + 30 * DAY);
    await createEntitlement({ userId: "fan", scope: "creator", creatorId: "creator1", type: "monthly", startsAt: end, endsAt: stacked });
    const v = await view("fan");
    expect(v.tiles.every((t) => t.kind === "unlocked")).toBe(true);
    expect(v.accessUntil).toEqual(stacked);
    // Timed access can still be extended or upgraded: offers stay visible.
    expect(v.offers.map((o) => o.type)).toEqual(["monthly", "one_time"]);
  });

  it("does not unlock with an expired, revoked or other creator's grant", async () => {
    await seed();
    await createEntitlement({ userId: "fan", scope: "creator", creatorId: "creator1", type: "monthly", startsAt: new Date(NOW.getTime() - 40 * DAY), endsAt: new Date(NOW.getTime() - 10 * DAY) });
    await createEntitlement({ userId: "fan", scope: "creator", creatorId: "creator2", type: "one_time", startsAt: NOW, endsAt: null });
    const v = await view("fan");
    expect(v.tiles.map((t) => t.kind)).toEqual(["locked"]);
    expect(v.accessUntil).toBeNull();
  });

  it("shows the offered collection options with checkout links", async () => {
    await setCreatorPricing("creator1", { monthlyPriceCents: 500, yearlyPriceCents: 5000, oneTimePriceCents: null });
    const v: PrivateCollectionView = await view("fan");
    expect(v.offers).toEqual([
      { type: "monthly", priceCents: 500, href: "/checkout?type=monthly&creator=creator1" },
      { type: "yearly", priceCents: 5000, href: "/checkout?type=yearly&creator=creator1" },
    ]);
    expect((await view(null)).offers).toHaveLength(2);
  });

  it("hides offers for a viewer holding a valid one-time grant", async () => {
    await setCreatorPricing("creator1", { monthlyPriceCents: 500, yearlyPriceCents: 5000, oneTimePriceCents: 9900 });
    await createEntitlement({ userId: "fan", scope: "creator", creatorId: "creator1", type: "one_time", startsAt: NOW, endsAt: null });
    const v = await view("fan");
    expect(v.offers).toEqual([]);
    expect(v.accessUntil).toBeNull();
  });

  it("offers nothing when the creator sells no collection access", async () => {
    expect((await view("fan")).offers).toEqual([]);
  });
});
