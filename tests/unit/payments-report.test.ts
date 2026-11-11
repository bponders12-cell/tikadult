import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckout } from "@/lib/payments/checkout";
import { resetMemoryPricing, setCreatorPricing } from "@/lib/payments/pricing";
import { applyPaymentEvent } from "@/lib/payments/reconcile";
import { resetMemoryPlatformSettings, setCreatorShareBps } from "@/lib/platform-settings";
import {
  createTransaction,
  getTransaction,
  markCreatorPayoutsPaid,
  resetMemoryPayments,
  setTransactionProviderRef,
  type AccessType,
  type TransactionRecord,
} from "@/lib/payments/records";
import { getMoneyFlowReport } from "@/lib/payments/report";
import { computeSplit } from "@/lib/payments/split";

type Outcome = "pending" | "completed" | "failed" | "refunded" | "chargeback";

let seq = 0;

/** Creates a transaction with a snapshotted split, then drives it to `outcome` through verified events. */
async function seed(
  outcome: Outcome,
  opts: { creatorId?: string | null; accessType?: AccessType; grossCents?: number; bps?: number } = {},
): Promise<TransactionRecord> {
  const accessType = opts.accessType ?? "monthly";
  const split = computeSplit(opts.grossCents ?? 1000, opts.bps ?? 8000);
  const tx = await createTransaction({
    buyerId: "buyer1",
    creatorId: opts.creatorId === undefined ? "creator1" : opts.creatorId,
    mediaId: accessType === "per_video" ? "media1" : null,
    accessType,
    ...split,
    creatorShareBps: opts.bps ?? 8000,
    provider: "fake",
  });
  const ref = `ref_${++seq}`;
  await setTransactionProviderRef(tx.id, ref);
  const send = (type: "completed" | "failed" | "refunded" | "chargeback") =>
    applyPaymentEvent("fake", { eventId: `ev_${++seq}`, type: `payment.${type}`, providerRef: ref });
  if (outcome === "failed") await send("failed");
  if (outcome === "completed" || outcome === "refunded" || outcome === "chargeback") await send("completed");
  if (outcome === "refunded" || outcome === "chargeback") await send(outcome);
  return (await getTransaction(tx.id))!;
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("PAYMENT_PROVIDER", undefined);
  resetMemoryPayments();
  resetMemoryPricing();
  resetMemoryPlatformSettings();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("getMoneyFlowReport", () => {
  it("returns zeros (all keys present) when there are no transactions", async () => {
    const r = await getMoneyFlowReport();
    expect(r.totals).toEqual({ count: 0, grossCents: 0, platformFeeCents: 0, creatorEarningsCents: 0 });
    expect(r.refunded).toEqual({ count: 0, grossCents: 0, paidOutCount: 0, paidOutCents: 0 });
    expect(r.chargeback).toEqual({ count: 0, grossCents: 0, paidOutCount: 0, paidOutCents: 0 });
    expect(r.pending).toEqual({ count: 0 });
    expect(r.failed).toEqual({ count: 0 });
    expect(r.byAccessType).toEqual({
      monthly: { count: 0, grossCents: 0 },
      yearly: { count: 0, grossCents: 0 },
      one_time: { count: 0, grossCents: 0 },
      per_video: { count: 0, grossCents: 0 },
    });
    expect(r.payouts).toEqual({ unpaidCents: 0, paidCents: 0 });
    expect(r.byCreator).toEqual([]);
    expect(r.recent).toEqual([]);
  });

  it("aggregates a mixed-status history", async () => {
    await seed("completed", { creatorId: "creator1", accessType: "monthly", grossCents: 1000 }); // 800 / 200
    await seed("completed", { creatorId: "creator1", accessType: "per_video", grossCents: 499 }); // 399 / 100
    await seed("completed", { creatorId: "creator2", accessType: "yearly", grossCents: 5000 }); // 4000 / 1000
    await seed("refunded", { creatorId: "creator1", grossCents: 700 });
    await seed("chargeback", { creatorId: "creator2", grossCents: 300 });
    await seed("chargeback", { creatorId: "creator2", grossCents: 200 });
    await seed("pending", { grossCents: 999 });
    await seed("failed", { grossCents: 999 });
    await seed("failed", { grossCents: 999 });

    const r = await getMoneyFlowReport();
    expect(r.totals).toEqual({ count: 3, grossCents: 6499, platformFeeCents: 1300, creatorEarningsCents: 5199 });
    expect(r.refunded).toEqual({ count: 1, grossCents: 700, paidOutCount: 0, paidOutCents: 0 });
    expect(r.chargeback).toEqual({ count: 2, grossCents: 500, paidOutCount: 0, paidOutCents: 0 });
    expect(r.pending).toEqual({ count: 1 });
    expect(r.failed).toEqual({ count: 2 });
    expect(r.byAccessType).toEqual({
      monthly: { count: 1, grossCents: 1000 },
      yearly: { count: 1, grossCents: 5000 },
      one_time: { count: 0, grossCents: 0 },
      per_video: { count: 1, grossCents: 499 },
    });
    expect(r.payouts).toEqual({ unpaidCents: 5199, paidCents: 0 });
    expect(r.byCreator).toEqual([
      { creatorId: "creator2", count: 1, grossCents: 5000, creatorEarningsCents: 4000, unpaidCents: 4000, paidCents: 0 },
      { creatorId: "creator1", count: 2, grossCents: 1499, creatorEarningsCents: 1199, unpaidCents: 1199, paidCents: 0 },
    ]);
    expect(r.recent).toHaveLength(9);
    for (const k of ["grossCents", "platformFeeCents", "creatorEarningsCents"] as const) {
      expect(typeof r.totals[k]).toBe("number");
    }
  });

  it("sums the stored split: a split change mid-history leaves earlier amounts and totals intact", async () => {
    await setCreatorPricing("creator1", { monthlyPriceCents: 1000, yearlyPriceCents: null, oneTimePriceCents: null });
    const buy = async () => {
      const res = await createCheckout({ buyerId: "buyer1", accessType: "monthly", creatorId: "creator1", origin: "http://x" });
      if (!res.ok) throw new Error(res.error);
      const tx = (await getTransaction(res.transactionId))!;
      await applyPaymentEvent("fake", { eventId: `ev_${++seq}`, type: "payment.completed", providerRef: tx.providerRef! });
      return tx;
    };

    const before = await buy(); // default 80% -> 800 / 200
    const reportBefore = await getMoneyFlowReport();
    await setCreatorShareBps(7000);
    const after = await buy(); // 70% -> 700 / 300

    expect(await getTransaction(before.id)).toMatchObject({
      creatorShareBps: 8000,
      creatorEarningsCents: 800,
      platformFeeCents: 200,
    });
    expect(after).toMatchObject({ creatorShareBps: 7000, creatorEarningsCents: 700, platformFeeCents: 300 });
    expect(reportBefore.totals).toEqual({ count: 1, grossCents: 1000, platformFeeCents: 200, creatorEarningsCents: 800 });
    const r = await getMoneyFlowReport();
    expect(r.totals).toEqual({ count: 2, grossCents: 2000, platformFeeCents: 500, creatorEarningsCents: 1500 });
    expect(r.payouts).toEqual({ unpaidCents: 1500, paidCents: 0 });
  });

  it("separates unpaid and paid creator earnings and sorts creators by unpaid descending", async () => {
    await seed("completed", { creatorId: "big", grossCents: 10000 }); // 8000
    await seed("completed", { creatorId: "small", grossCents: 1000 }); // 800
    await seed("completed", { creatorId: "paid", grossCents: 20000 }); // 16000
    await markCreatorPayoutsPaid("paid");
    await seed("completed", { creatorId: "paid", grossCents: 500 }); // 400 unpaid

    const r = await getMoneyFlowReport();
    expect(r.payouts).toEqual({ unpaidCents: 9200, paidCents: 16000 });
    expect(r.byCreator.map((c) => [c.creatorId, c.unpaidCents, c.paidCents])).toEqual([
      ["big", 8000, 0],
      ["small", 800, 0],
      ["paid", 400, 16000],
    ]);
    expect(r.byCreator[2]).toMatchObject({ count: 2, grossCents: 20500, creatorEarningsCents: 16400 });
  });

  it("filters on createdAt: from inclusive, to exclusive", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T00:00:00Z"));
    await seed("completed", { grossCents: 100 });
    vi.setSystemTime(new Date("2026-02-10T00:00:00Z"));
    const feb = await seed("completed", { grossCents: 200 });
    await seed("refunded", { grossCents: 50 });
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    await seed("completed", { grossCents: 400 });

    const r = await getMoneyFlowReport({
      from: new Date("2026-02-10T00:00:00Z"),
      to: new Date("2026-03-01T00:00:00Z"),
    });
    expect(r.totals).toMatchObject({ count: 1, grossCents: 200 });
    expect(r.refunded).toEqual({ count: 1, grossCents: 50, paidOutCount: 0, paidOutCents: 0 });
    expect(r.byAccessType.monthly).toEqual({ count: 1, grossCents: 200 });
    expect(r.byCreator).toEqual([expect.objectContaining({ creatorId: "creator1", grossCents: 200 })]);
    expect(r.recent.map((t) => t.id)).toContain(feb.id);
    expect(r.recent).toHaveLength(2);

    expect((await getMoneyFlowReport({ from: new Date("2026-02-01T00:00:00Z") })).totals.grossCents).toBe(600);
    expect((await getMoneyFlowReport({ to: new Date("2026-02-01T00:00:00Z") })).totals.grossCents).toBe(100);
  });

  it("lists the latest 50 transactions, newest first", async () => {
    vi.useFakeTimers();
    const ids: string[] = [];
    for (let i = 0; i < 55; i++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, i)));
      ids.push((await seed("pending")).id);
    }
    const r = await getMoneyFlowReport();
    expect(r.recent).toHaveLength(50);
    expect(r.recent.map((t) => t.id)).toEqual(ids.slice(5).reverse());
  });

  it("reports refunds/chargebacks of earnings already paid out to the creator", async () => {
    const reverse = (t: TransactionRecord, type: "refunded" | "chargeback") =>
      applyPaymentEvent("fake", { eventId: `ev_${++seq}`, type: `payment.${type}`, providerRef: t.providerRef! });
    const refundedAfterPayout = await seed("completed", { creatorId: "c1", grossCents: 1000 }); // 800
    const chargedAfterPayout = await seed("completed", { creatorId: "c1", grossCents: 500 }); // 400
    const kept = await seed("completed", { creatorId: "c1", grossCents: 2000 }); // 1600
    expect(await markCreatorPayoutsPaid("c1")).toEqual({ markedCount: 3, paidCents: 2800 });
    await reverse(refundedAfterPayout, "refunded");
    await reverse(chargedAfterPayout, "chargeback");
    await seed("refunded", { creatorId: "c1", grossCents: 300 }); // refunded before any payout

    const r = await getMoneyFlowReport();
    expect(r.refunded).toEqual({ count: 2, grossCents: 1300, paidOutCount: 1, paidOutCents: 800 });
    expect(r.chargeback).toEqual({ count: 1, grossCents: 500, paidOutCount: 1, paidOutCents: 400 });
    expect(r.payouts).toEqual({ unpaidCents: 0, paidCents: 1600 });
    expect(await getTransaction(kept.id)).toMatchObject({ status: "completed", payoutStatus: "paid" });
  });

  it("keeps a transaction whose creator was deleted under a null creatorId", async () => {
    await seed("completed", { creatorId: null, grossCents: 1000 });
    const r = await getMoneyFlowReport();
    expect(r.byCreator).toEqual([
      { creatorId: null, count: 1, grossCents: 1000, creatorEarningsCents: 800, unpaidCents: 800, paidCents: 0 },
    ]);
  });
});

describe("markCreatorPayoutsPaid", () => {
  it("marks only that creator's completed + unpaid transactions; a second call marks none", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    const a = await seed("completed", { creatorId: "c1", grossCents: 1000 }); // 800
    const b = await seed("completed", { creatorId: "c1", grossCents: 500 }); // 400
    const pending = await seed("pending", { creatorId: "c1" });
    const failed = await seed("failed", { creatorId: "c1" });
    const refunded = await seed("refunded", { creatorId: "c1" });
    const charged = await seed("chargeback", { creatorId: "c1" });
    const other = await seed("completed", { creatorId: "c2" });

    vi.setSystemTime(new Date("2026-05-02T12:00:00Z"));
    expect(await markCreatorPayoutsPaid("c1")).toEqual({ markedCount: 2, paidCents: 1200 });

    for (const t of [a, b]) {
      expect(await getTransaction(t.id)).toMatchObject({
        payoutStatus: "paid",
        paidOutAt: new Date("2026-05-02T12:00:00Z"),
      });
    }
    for (const t of [pending, failed, refunded, charged, other]) {
      expect(await getTransaction(t.id)).toMatchObject({ payoutStatus: "unpaid", paidOutAt: null });
    }
    expect(await markCreatorPayoutsPaid("c1")).toEqual({ markedCount: 0, paidCents: 0 });
    expect(await markCreatorPayoutsPaid("nobody")).toEqual({ markedCount: 0, paidCents: 0 });
  });

  it("with completedAsOf, marks only transactions completed at or before that time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    const confirmed = await seed("completed", { creatorId: "c1", grossCents: 1000 }); // 800
    const asOf = new Date(); // what the admin saw and confirmed
    vi.setSystemTime(new Date("2026-05-01T12:00:01Z"));
    const later = await seed("completed", { creatorId: "c1", grossCents: 500 }); // completed after render

    expect(await markCreatorPayoutsPaid("c1", { completedAsOf: asOf })).toEqual({ markedCount: 1, paidCents: 800 });
    expect(await getTransaction(confirmed.id)).toMatchObject({ payoutStatus: "paid" });
    expect(await getTransaction(later.id)).toMatchObject({ payoutStatus: "unpaid", paidOutAt: null });
  });
});
