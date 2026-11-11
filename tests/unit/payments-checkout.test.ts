import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckout } from "@/lib/payments/checkout";
import { createFakeProvider, type PaymentProvider } from "@/lib/payments/provider";
import { setCreatorPricing, resetMemoryPricing } from "@/lib/payments/pricing";
import {
  createEntitlement,
  getTransaction,
  listTransactions,
  resetMemoryPayments,
} from "@/lib/payments/records";
import { resetMemoryPlatformSettings, setCreatorShareBps } from "@/lib/platform-settings";
import { createMedia, resetMemoryMedia, updateMedia, type MediaVisibility } from "@/lib/media/records";

const DAY = 24 * 60 * 60 * 1000;
const ORIGIN = "https://site.test";
const NONE = { monthlyPriceCents: null, yearlyPriceCents: null, oneTimePriceCents: null };

async function seedMedia(
  opts: { visibility?: MediaVisibility; price?: number | null; live?: boolean; ownerId?: string } = {},
) {
  const m = await createMedia({
    ownerId: opts.ownerId ?? "creator1",
    type: "video",
    visibility: opts.visibility ?? "private",
    unlockPriceCents: opts.price === undefined ? 499 : opts.price,
    title: "Clip",
  });
  if (opts.live !== false) await updateMedia(m.id, { status: "live", processingStatus: "ready" });
  return m;
}

const perVideo = (mediaId: string | undefined, buyerId = "buyer") =>
  createCheckout({ buyerId, accessType: "per_video", mediaId, origin: ORIGIN });
const collection = (
  accessType: "monthly" | "yearly" | "one_time",
  creatorId: string | undefined = "creator1",
  buyerId = "buyer",
) => createCheckout({ buyerId, accessType, creatorId, origin: ORIGIN });

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("PAYMENT_PROVIDER", undefined);
  resetMemoryMedia();
  resetMemoryPayments();
  resetMemoryPricing();
  resetMemoryPlatformSettings();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("provider resolution", () => {
  it("503s and creates no transaction when payments are not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const m = await seedMedia();
    const res = await perVideo(m.id);
    expect(res).toMatchObject({ ok: false, status: 503 });
    expect(await listTransactions()).toEqual([]);
  });
});

describe("per_video", () => {
  it("creates a pending transaction with the split snapshot and returns the provider redirect", async () => {
    const m = await seedMedia({ price: 499 });
    const res = await perVideo(m.id);
    if (!res.ok) throw new Error(res.error);
    expect(res.redirectUrl).toBe(`/checkout/fake?tx=${res.transactionId}`);
    const tx = await getTransaction(res.transactionId);
    expect(tx).toMatchObject({
      buyerId: "buyer",
      creatorId: "creator1",
      mediaId: m.id,
      accessType: "per_video",
      grossCents: 499,
      creatorShareBps: 8000,
      creatorEarningsCents: 399,
      platformFeeCents: 100,
      currency: "USD",
      status: "pending",
      provider: "fake",
      providerRef: `fake_${res.transactionId}`,
    });
  });

  it("treats restricted the same as private", async () => {
    const m = await seedMedia({ visibility: "restricted" });
    expect((await perVideo(m.id)).ok).toBe(true);
  });

  it("400s without a mediaId", async () => {
    expect(await perVideo(undefined)).toMatchObject({ ok: false, status: 400 });
  });

  it("404s for missing, non-live or public media", async () => {
    expect(await perVideo("nope")).toMatchObject({ ok: false, status: 404 });
    const draft = await seedMedia({ live: false });
    expect(await perVideo(draft.id)).toMatchObject({ ok: false, status: 404 });
    const pub = await seedMedia({ visibility: "public" });
    expect(await perVideo(pub.id)).toMatchObject({ ok: false, status: 404 });
  });

  it("400s when the item is not sold individually (null or 0 price)", async () => {
    const free = await seedMedia({ price: null });
    expect(await perVideo(free.id)).toMatchObject({ ok: false, status: 400 });
    const zero = await seedMedia({ price: 0 });
    expect(await perVideo(zero.id)).toMatchObject({ ok: false, status: 400 });
  });

  it("400s when the buyer owns the item", async () => {
    const m = await seedMedia();
    expect(await perVideo(m.id, "creator1")).toMatchObject({ ok: false, status: 400 });
  });

  it("409s when the buyer already has access via a per-video grant", async () => {
    const m = await seedMedia();
    await createEntitlement({
      userId: "buyer",
      scope: "media",
      mediaId: m.id,
      type: "per_video",
      startsAt: new Date(Date.now() - DAY),
      endsAt: null,
    });
    expect(await perVideo(m.id)).toMatchObject({ ok: false, status: 409 });
  });

  it("409s when the buyer already has access via a collection grant", async () => {
    const m = await seedMedia();
    await createEntitlement({
      userId: "buyer",
      scope: "creator",
      creatorId: "creator1",
      type: "monthly",
      startsAt: new Date(Date.now() - DAY),
      endsAt: new Date(Date.now() + DAY),
    });
    expect(await perVideo(m.id)).toMatchObject({ ok: false, status: 409 });
    expect(await listTransactions()).toEqual([]);
  });

  it("allows purchase when a previous collection grant has expired", async () => {
    const m = await seedMedia();
    await createEntitlement({
      userId: "buyer",
      scope: "creator",
      creatorId: "creator1",
      type: "monthly",
      startsAt: new Date(Date.now() - 40 * DAY),
      endsAt: new Date(Date.now() - 10 * DAY),
    });
    expect((await perVideo(m.id)).ok).toBe(true);
  });
});

describe("collection (monthly / yearly / one_time)", () => {
  beforeEach(async () => {
    await setCreatorPricing("creator1", { monthlyPriceCents: 999, yearlyPriceCents: 9900, oneTimePriceCents: 2501 });
  });

  it("creates a pending transaction priced from CreatorPricing", async () => {
    for (const [type, cents] of [
      ["monthly", 999],
      ["yearly", 9900],
      ["one_time", 2501],
    ] as const) {
      const res = await collection(type);
      if (!res.ok) throw new Error(res.error);
      const tx = await getTransaction(res.transactionId);
      expect(tx).toMatchObject({
        accessType: type,
        grossCents: cents,
        creatorId: "creator1",
        mediaId: null,
        buyerId: "buyer",
        status: "pending",
        providerRef: `fake_${res.transactionId}`,
      });
      expect(tx!.creatorEarningsCents + tx!.platformFeeCents).toBe(cents);
    }
  });

  it("400s without a creatorId", async () => {
    const res = await createCheckout({ buyerId: "buyer", accessType: "monthly", origin: ORIGIN });
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it("400s when the option is not offered", async () => {
    await setCreatorPricing("creator1", { ...NONE, monthlyPriceCents: 999 });
    expect(await collection("yearly")).toMatchObject({ ok: false, status: 400 });
    expect(await collection("one_time")).toMatchObject({ ok: false, status: 400 });
    expect(await collection("monthly", "unpriced-creator")).toMatchObject({ ok: false, status: 400 });
  });

  it("400s when the buyer is the creator", async () => {
    expect(await collection("monthly", "creator1", "creator1")).toMatchObject({ ok: false, status: 400 });
  });

  it("409s for a one-time purchase when a valid one-time grant exists", async () => {
    await createEntitlement({
      userId: "buyer",
      scope: "creator",
      creatorId: "creator1",
      type: "one_time",
      startsAt: new Date(Date.now() - DAY),
      endsAt: null,
    });
    expect(await collection("one_time")).toMatchObject({ ok: false, status: 409 });
    expect(await collection("one_time", "creator1", "other-buyer")).toMatchObject({ ok: true });
  });

  it("does not 409 a one-time purchase for a different creator's grant", async () => {
    await setCreatorPricing("creator2", { ...NONE, oneTimePriceCents: 100 });
    await createEntitlement({
      userId: "buyer",
      scope: "creator",
      creatorId: "creator2",
      type: "one_time",
      startsAt: new Date(Date.now() - DAY),
      endsAt: null,
    });
    expect((await collection("one_time")).ok).toBe(true);
  });

  it("allows repeat monthly/yearly while a timed grant is active (terms stack later)", async () => {
    await createEntitlement({
      userId: "buyer",
      scope: "creator",
      creatorId: "creator1",
      type: "monthly",
      startsAt: new Date(Date.now() - DAY),
      endsAt: new Date(Date.now() + DAY),
    });
    expect((await collection("monthly")).ok).toBe(true);
    expect((await collection("yearly")).ok).toBe(true);
  });
});

describe("split snapshot", () => {
  it("stores the setting at creation and is unaffected by later changes", async () => {
    await setCreatorShareBps(7000);
    const m = await seedMedia({ price: 1001 });
    const res = await perVideo(m.id);
    if (!res.ok) throw new Error(res.error);
    const expected = { creatorShareBps: 7000, creatorEarningsCents: 700, platformFeeCents: 301, grossCents: 1001 };
    expect(await getTransaction(res.transactionId)).toMatchObject(expected);

    await setCreatorShareBps(8000);
    expect(await getTransaction(res.transactionId)).toMatchObject(expected);

    const m2 = await seedMedia({ price: 1001 });
    const res2 = await perVideo(m2.id);
    if (!res2.ok) throw new Error(res2.error);
    expect(await getTransaction(res2.transactionId)).toMatchObject({ creatorShareBps: 8000, creatorEarningsCents: 800 });
  });
});

describe("provider interaction", () => {
  it("passes amount, currency and result URLs to the provider", async () => {
    const fake = createFakeProvider("s");
    const spy = vi.spyOn(fake, "createCheckout");
    const m = await seedMedia({ price: 250 });
    const res = await createCheckout(
      { buyerId: "buyer", accessType: "per_video", mediaId: m.id, origin: `${ORIGIN}/` },
      { getProvider: () => fake },
    );
    if (!res.ok) throw new Error(res.error);
    const tx = res.transactionId;
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: tx,
        amountCents: 250,
        currency: "USD",
        successUrl: `${ORIGIN}/checkout/result?tx=${tx}`,
        cancelUrl: `${ORIGIN}/checkout/result?tx=${tx}&cancelled=1`,
      }),
    );
  });

  it("502s when the provider fails, leaving an orphan pending transaction without providerRef", async () => {
    const failing: PaymentProvider = {
      name: "flaky",
      createCheckout: async () => {
        throw new Error("provider down");
      },
      parseWebhook: async () => null,
    };
    const m = await seedMedia();
    const res = await createCheckout(
      { buyerId: "buyer", accessType: "per_video", mediaId: m.id, origin: ORIGIN },
      { getProvider: () => failing },
    );
    expect(res).toMatchObject({ ok: false, status: 502 });
    const [tx] = await listTransactions();
    expect(tx).toMatchObject({ status: "pending", providerRef: null, provider: "flaky" });
  });

  it("rethrows unexpected provider resolution errors", async () => {
    const m = await seedMedia();
    await expect(
      createCheckout(
        { buyerId: "buyer", accessType: "per_video", mediaId: m.id, origin: ORIGIN },
        {
          getProvider: () => {
            throw new Error("boom");
          },
        },
      ),
    ).rejects.toThrow("boom");
  });
});
