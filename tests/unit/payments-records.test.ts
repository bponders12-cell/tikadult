import { beforeEach, describe, expect, it } from "vitest";
import {
  createEntitlement,
  createTransaction,
  getTransaction,
  getTransactionByProviderRef,
  listEntitlementsForUser,
  listTransactions,
  resetMemoryPayments,
  setTransactionProviderRef,
} from "@/lib/payments/records";

const base = {
  buyerId: "buyer1",
  creatorId: "creator1",
  mediaId: null,
  accessType: "monthly" as const,
  grossCents: 1000,
  platformFeeCents: 200,
  creatorEarningsCents: 800,
  creatorShareBps: 8000,
  provider: "fake",
};

describe("payments records (in-memory backing)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetMemoryPayments();
  });

  it("creates a pending, unpaid USD transaction with numeric money", async () => {
    const t = await createTransaction(base);
    expect(t.id).toBeTruthy();
    expect(t).toMatchObject({
      buyerId: "buyer1",
      creatorId: "creator1",
      mediaId: null,
      accessType: "monthly",
      grossCents: 1000,
      platformFeeCents: 200,
      creatorEarningsCents: 800,
      creatorShareBps: 8000,
      currency: "USD",
      status: "pending",
      provider: "fake",
      providerRef: null,
      entitlementId: null,
      payoutStatus: "unpaid",
      paidOutAt: null,
      completedAt: null,
    });
    for (const k of ["grossCents", "platformFeeCents", "creatorEarningsCents"] as const) {
      expect(typeof t[k]).toBe("number");
    }
    expect(await getTransaction(t.id)).toEqual(t);
    expect(await getTransaction("nope")).toBeNull();
  });

  it("returns copies, not live references", async () => {
    const t = await createTransaction(base);
    t.grossCents = 1;
    expect((await getTransaction(t.id))?.grossCents).toBe(1000);
  });

  it("sets and looks up by provider reference", async () => {
    const t = await createTransaction(base);
    expect(await getTransactionByProviderRef("fake", "ref-1")).toBeNull();
    const updated = await setTransactionProviderRef(t.id, "ref-1");
    expect(updated?.providerRef).toBe("ref-1");
    expect((await getTransactionByProviderRef("fake", "ref-1"))?.id).toBe(t.id);
    expect(await getTransactionByProviderRef("other", "ref-1")).toBeNull();
    expect(await setTransactionProviderRef("missing", "x")).toBeNull();
  });

  it("accepts a provider reference at creation", async () => {
    const t = await createTransaction({ ...base, providerRef: "ref-2" });
    expect((await getTransactionByProviderRef("fake", "ref-2"))?.id).toBe(t.id);
  });

  it("lists transactions newest first with optional filters", async () => {
    const a = await createTransaction(base);
    const b = await createTransaction({ ...base, creatorId: "creator2", buyerId: "buyer2" });
    const all = await listTransactions();
    expect(all.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
    expect((await listTransactions({ creatorId: "creator2" })).map((t) => t.id)).toEqual([b.id]);
    expect((await listTransactions({ buyerId: "buyer1" })).map((t) => t.id)).toEqual([a.id]);
    expect(await listTransactions({ status: "completed" })).toEqual([]);
    expect((await listTransactions({ status: "pending" })).length).toBe(2);
  });

  it("creates active entitlements and lists them per user", async () => {
    const startsAt = new Date("2026-01-01T00:00:00Z");
    const endsAt = new Date("2026-01-31T00:00:00Z");
    const e = await createEntitlement({
      userId: "buyer1",
      scope: "creator",
      creatorId: "creator1",
      type: "monthly",
      startsAt,
      endsAt,
    });
    expect(e).toMatchObject({
      userId: "buyer1",
      scope: "creator",
      creatorId: "creator1",
      mediaId: null,
      type: "monthly",
      status: "active",
      startsAt,
      endsAt,
    });
    await createEntitlement({
      userId: "buyer1",
      scope: "media",
      mediaId: "m1",
      type: "per_video",
      startsAt,
      endsAt: null,
    });
    await createEntitlement({
      userId: "buyer2",
      scope: "media",
      mediaId: "m1",
      type: "per_video",
      startsAt,
      endsAt: null,
    });
    const list = await listEntitlementsForUser("buyer1");
    expect(list).toHaveLength(2);
    expect(list.every((x) => x.userId === "buyer1")).toBe(true);
    expect(await listEntitlementsForUser("nobody")).toEqual([]);
  });
});
