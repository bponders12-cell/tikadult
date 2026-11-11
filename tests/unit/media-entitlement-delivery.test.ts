import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));

import { GET as deliver } from "@/app/api/media/[id]/asset/[kind]/route";
import { canFetchAsset } from "@/lib/media/delivery";
import {
  createMedia,
  resetMemoryMedia,
  setMediaAsset,
  updateMedia,
  type MediaRecord,
  type MediaVisibility,
} from "@/lib/media/records";
import { getStorage } from "@/lib/media/storage";
import { applyPaymentEvent } from "@/lib/payments/reconcile";
import { createEntitlement, createTransaction, resetMemoryPayments } from "@/lib/payments/records";

const DAY = 24 * 60 * 60 * 1000;
const AGE = { cookie: "age_confirmed=1" };
const as = (id: string | null) => getSession.mockResolvedValue(id ? { user: { id } } : null);
const get = (id: string, kind = "web", headers: Record<string, string> = AGE) =>
  deliver(new Request(`http://x/api/media/${id}/asset/${kind}`, { headers }), {
    params: Promise.resolve({ id, kind }),
  });

async function seedPrivate(opts: { visibility?: MediaVisibility; ownerId?: string } = {}) {
  const m = await createMedia({
    ownerId: opts.ownerId ?? "creator1",
    type: "video",
    visibility: opts.visibility ?? "private",
    unlockPriceCents: 499,
  });
  await getStorage().put(`media/${m.id}/web`, Uint8Array.from([1, 2, 3]));
  await setMediaAsset(m.id, { kind: "web", storageKey: `media/${m.id}/web`, contentType: "video/mp4", sizeBytes: 3 });
  await getStorage().put(`media/${m.id}/thumb`, Uint8Array.from([9]));
  await setMediaAsset(m.id, {
    kind: "thumbnail",
    storageKey: `media/${m.id}/thumb`,
    contentType: "image/jpeg",
    sizeBytes: 1,
  });
  await updateMedia(m.id, { status: "live", processingStatus: "ready", publishedAt: new Date() });
  return m;
}

const grantMedia = (userId: string, mediaId: string, endsAt: Date | null = null) =>
  createEntitlement({ userId, scope: "media", mediaId, type: "per_video", startsAt: new Date(Date.now() - DAY), endsAt });
const grantCreator = (userId: string, creatorId: string, startsAt: Date, endsAt: Date | null) =>
  createEntitlement({ userId, scope: "creator", creatorId, type: endsAt ? "monthly" : "one_time", startsAt, endsAt });

let dir: string;
beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", undefined);
  dir = await mkdtemp(path.join(tmpdir(), "media-ent-"));
  vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  resetMemoryMedia();
  resetMemoryPayments();
  as(null);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("canFetchAsset", () => {
  const media = (patch: Partial<MediaRecord>): MediaRecord =>
    ({ id: "m", ownerId: "o", status: "live", visibility: "private", ...patch }) as MediaRecord;

  it("implements the access rule", () => {
    expect(canFetchAsset(media({ visibility: "public" }), null)).toBe(true);
    expect(canFetchAsset(media({ status: "draft" }), "o")).toBe(true);
    expect(canFetchAsset(media({}), null)).toBe(false);
    expect(canFetchAsset(media({}), "u")).toBe(false);
    expect(canFetchAsset(media({}), "u", true)).toBe(true);
    expect(canFetchAsset(media({ visibility: "restricted" }), "u", true)).toBe(true);
    expect(canFetchAsset(media({ status: "flagged" }), "u", true)).toBe(false);
    expect(canFetchAsset(media({ status: "removed", visibility: "public" }), "u", true)).toBe(false);
  });
});

describe("asset route with a private item", () => {
  it("404s anonymous viewers (with the age cookie)", async () => {
    const m = await seedPrivate();
    expect((await get(m.id)).status).toBe(404);
    expect((await get(m.id, "thumbnail")).status).toBe(404);
  });

  it("404s signed-in viewers without a grant", async () => {
    const m = await seedPrivate();
    await grantMedia("buyer", "some-other-media");
    await grantCreator("buyer", "other-creator", new Date(Date.now() - DAY), null);
    as("buyer");
    expect((await get(m.id)).status).toBe(404);
    expect((await get(m.id, "thumbnail")).status).toBe(404);
  });

  it("serves a per-video grant holder, never cached", async () => {
    const m = await seedPrivate();
    await grantMedia("buyer", m.id);
    as("buyer");
    const res = await get(m.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3]));
    expect((await get(m.id, "thumbnail")).status).toBe(200);
  });

  it("serves a collection grant holder for any private or restricted item of that creator", async () => {
    const a = await seedPrivate();
    const b = await seedPrivate({ visibility: "restricted" });
    const other = await seedPrivate({ ownerId: "creator2" });
    await grantCreator("buyer", "creator1", new Date(Date.now() - DAY), new Date(Date.now() + DAY));
    as("buyer");
    expect((await get(a.id)).status).toBe(200);
    expect((await get(b.id, "thumbnail")).status).toBe(200);
    expect((await get(other.id)).status).toBe(404);
  });

  it("404s once the grant has expired, and before a stacked term starts", async () => {
    const m = await seedPrivate();
    await grantCreator("buyer", "creator1", new Date(Date.now() - 31 * DAY), new Date(Date.now() - DAY));
    await grantCreator("buyer", "creator1", new Date(Date.now() + DAY), new Date(Date.now() + 31 * DAY));
    as("buyer");
    expect((await get(m.id)).status).toBe(404);
    expect((await get(m.id, "thumbnail")).status).toBe(404);
  });

  it("404s after a refund revoked the grant", async () => {
    const m = await seedPrivate();
    await createTransaction({
      buyerId: "buyer",
      creatorId: "creator1",
      mediaId: m.id,
      accessType: "per_video",
      grossCents: 499,
      platformFeeCents: 100,
      creatorEarningsCents: 399,
      creatorShareBps: 8000,
      provider: "fake",
      providerRef: "r1",
    });
    await applyPaymentEvent("fake", { eventId: "e1", type: "payment.completed", providerRef: "r1" });
    as("buyer");
    expect((await get(m.id)).status).toBe(200);
    await applyPaymentEvent("fake", { eventId: "e2", type: "payment.refunded", providerRef: "r1" });
    expect((await get(m.id)).status).toBe(404);
    expect((await get(m.id, "thumbnail")).status).toBe(404);
  });

  it("404s an entitled viewer once the item is no longer live", async () => {
    const m = await seedPrivate();
    await grantMedia("buyer", m.id);
    await grantCreator("buyer", "creator1", new Date(Date.now() - DAY), null);
    as("buyer");
    for (const status of ["flagged", "removed", "processing", "draft"] as const) {
      await updateMedia(m.id, { status });
      expect((await get(m.id)).status).toBe(404);
      expect((await get(m.id, "thumbnail")).status).toBe(404);
    }
  });

  it("still requires the 18+ check for anonymous viewers of public items, and serves the owner", async () => {
    const pub = await seedPrivate({ visibility: "public" });
    expect((await get(pub.id, "web", {})).status).toBe(404);
    expect((await get(pub.id)).status).toBe(200);
    const priv = await seedPrivate();
    as("creator1");
    expect((await get(priv.id, "web", {})).status).toBe(200);
  });
});
