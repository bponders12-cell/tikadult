import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPaymentEvent } from "@/lib/payments/reconcile";
import { hasMediaAccess } from "@/lib/payments/entitlements";
import type { PaymentEvent, PaymentEventType } from "@/lib/payments/provider";
import {
  createEntitlement,
  createTransaction,
  getTransaction,
  listEntitlementsForUser,
  resetMemoryPayments,
  type AccessType,
} from "@/lib/payments/records";
import { createMedia, resetMemoryMedia, updateMedia } from "@/lib/media/records";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-11-01T00:00:00.000Z");
let seq = 0;

async function pendingTx(
  opts: { accessType?: AccessType; creatorId?: string; mediaId?: string | null; buyerId?: string } = {},
) {
  const ref = `ref_${++seq}`;
  const tx = await createTransaction({
    buyerId: opts.buyerId ?? "buyer",
    creatorId: opts.creatorId ?? "creator1",
    mediaId: opts.mediaId ?? null,
    accessType: opts.accessType ?? "monthly",
    grossCents: 1000,
    platformFeeCents: 200,
    creatorEarningsCents: 800,
    creatorShareBps: 8000,
    provider: "fake",
    providerRef: ref,
  });
  return { tx, ref };
}

const event = (type: PaymentEventType, providerRef: string, eventId = `evt_${++seq}`): PaymentEvent => ({
  eventId,
  type,
  providerRef,
});
const apply = (type: PaymentEventType, ref: string, now = T0, eventId?: string) =>
  applyPaymentEvent("fake", event(type, ref, eventId), now);

const MONEY = { grossCents: 1000, platformFeeCents: 200, creatorEarningsCents: 800, creatorShareBps: 8000 };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", undefined);
  resetMemoryPayments();
  resetMemoryMedia();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("applyPaymentEvent", () => {
  it("payment.completed completes the transaction and links exactly one creator-scope grant", async () => {
    const { tx, ref } = await pendingTx({ accessType: "monthly" });
    expect(await apply("payment.completed", ref)).toBe("applied");

    const after = await getTransaction(tx.id);
    expect(after).toMatchObject({ status: "completed", completedAt: T0, ...MONEY });
    const grants = await listEntitlementsForUser("buyer");
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      id: after!.entitlementId,
      scope: "creator",
      creatorId: "creator1",
      mediaId: null,
      type: "monthly",
      status: "active",
      startsAt: T0,
      endsAt: new Date(T0.getTime() + 30 * DAY),
    });
  });

  it("per_video completion grants a never-expiring media-scope grant", async () => {
    const { ref } = await pendingTx({ accessType: "per_video", mediaId: "m1" });
    expect(await apply("payment.completed", ref)).toBe("applied");
    const [g] = await listEntitlementsForUser("buyer");
    expect(g).toMatchObject({ scope: "media", mediaId: "m1", creatorId: null, type: "per_video", endsAt: null });
  });

  it("payment.failed marks the transaction failed without a grant", async () => {
    const { tx, ref } = await pendingTx();
    expect(await apply("payment.failed", ref)).toBe("applied");
    expect(await getTransaction(tx.id)).toMatchObject({ status: "failed", entitlementId: null, completedAt: null });
    expect(await listEntitlementsForUser("buyer")).toHaveLength(0);
  });

  it("failed then completed grants (a later successful attempt)", async () => {
    const { tx, ref } = await pendingTx();
    await apply("payment.failed", ref);
    expect(await apply("payment.completed", ref)).toBe("applied");
    expect((await getTransaction(tx.id))!.status).toBe("completed");
    expect(await listEntitlementsForUser("buyer")).toHaveLength(1);
  });

  it("the same eventId twice is a duplicate and grants once", async () => {
    const { tx, ref } = await pendingTx();
    expect(await apply("payment.completed", ref, T0, "evt-same")).toBe("applied");
    const first = await getTransaction(tx.id);
    expect(await apply("payment.completed", ref, new Date(T0.getTime() + DAY), "evt-same")).toBe("duplicate");
    expect(await listEntitlementsForUser("buyer")).toHaveLength(1);
    expect(await getTransaction(tx.id)).toEqual(first);
  });

  it("a second distinct completed event is ignored and grants once", async () => {
    const { tx, ref } = await pendingTx();
    await apply("payment.completed", ref);
    const first = await getTransaction(tx.id);
    expect(await apply("payment.completed", ref, new Date(T0.getTime() + DAY))).toBe("ignored");
    expect(await listEntitlementsForUser("buyer")).toHaveLength(1);
    expect(await getTransaction(tx.id)).toEqual(first);
  });

  it("an ignored event is still recorded as seen (its replay is a duplicate)", async () => {
    const { ref } = await pendingTx();
    await apply("payment.completed", ref);
    expect(await apply("payment.failed", ref, T0, "evt-late-failure")).toBe("ignored");
    expect(await apply("payment.failed", ref, T0, "evt-late-failure")).toBe("duplicate");
  });

  it("rejects transitions the lifecycle does not allow", async () => {
    const { tx, ref } = await pendingTx();
    await apply("payment.completed", ref);
    expect(await apply("payment.failed", ref)).toBe("ignored"); // completed -> failed
    await apply("payment.refunded", ref);
    expect(await apply("payment.completed", ref)).toBe("ignored"); // refunded -> completed
    expect(await apply("payment.chargeback", ref)).toBe("ignored"); // refunded -> chargeback
    expect(await apply("payment.refunded", ref)).toBe("ignored"); // refunded -> refunded
    expect((await getTransaction(tx.id))!.status).toBe("refunded");
    expect(await listEntitlementsForUser("buyer")).toHaveLength(1);
  });

  describe("reversal delivered before completion (out-of-order events)", () => {
    it.each([
      ["payment.refunded", "refunded"],
      ["payment.chargeback", "chargeback"],
    ] as const)("%s while pending settles it terminally; the later completed event grants nothing", async (type, status) => {
      const { tx, ref } = await pendingTx({ accessType: "one_time" });
      expect(await apply(type, ref)).toBe("applied");
      expect(await getTransaction(tx.id)).toMatchObject({ status, completedAt: null, entitlementId: null, ...MONEY });

      expect(await apply("payment.completed", ref)).toBe("ignored");
      const after = await getTransaction(tx.id);
      expect(after).toMatchObject({ status, completedAt: null, entitlementId: null });
      expect(await listEntitlementsForUser("buyer")).toEqual([]);
    });

    it.each([
      ["payment.refunded", "refunded"],
      ["payment.chargeback", "chargeback"],
    ] as const)("%s after a failed attempt settles it terminally; a later completed grants nothing", async (type, status) => {
      const { tx, ref } = await pendingTx({ accessType: "monthly" });
      await apply("payment.failed", ref);
      expect(await apply(type, ref)).toBe("applied");
      expect(await apply("payment.completed", ref)).toBe("ignored");
      expect((await getTransaction(tx.id))!.status).toBe(status);
      expect(await listEntitlementsForUser("buyer")).toEqual([]);
    });

    it("the early reversal does not touch the buyer's other grants", async () => {
      const other = await pendingTx({ accessType: "per_video", mediaId: "m9" });
      await apply("payment.completed", other.ref);
      const { ref } = await pendingTx({ accessType: "one_time" });
      await apply("payment.refunded", ref);
      await apply("payment.completed", ref);
      expect((await listEntitlementsForUser("buyer")).map((g) => [g.type, g.status])).toEqual([
        ["per_video", "active"],
      ]);
    });

    it("a reversed-before-completion transaction is never counted as paid-out or completed", async () => {
      const { tx, ref } = await pendingTx({ accessType: "one_time" });
      await apply("payment.chargeback", ref);
      await apply("payment.completed", ref);
      expect(await getTransaction(tx.id)).toMatchObject({ status: "chargeback", payoutStatus: "unpaid" });
    });
  });

  it("failed -> failed is ignored", async () => {
    const { ref } = await pendingTx();
    await apply("payment.failed", ref);
    expect(await apply("payment.failed", ref)).toBe("ignored");
  });

  it.each(["payment.refunded", "payment.chargeback"] as const)("%s revokes the linked grant", async (type) => {
    const { tx, ref } = await pendingTx({ accessType: "one_time" });
    await apply("payment.completed", ref);
    expect(await apply(type, ref)).toBe("applied");
    const after = await getTransaction(tx.id);
    expect(after!.status).toBe(type === "payment.refunded" ? "refunded" : "chargeback");
    expect(after).toMatchObject(MONEY);
    const [g] = await listEntitlementsForUser("buyer");
    expect(g.id).toBe(after!.entitlementId);
    expect(g.status).toBe("revoked");
  });

  it("refund revokes only the linked grant, not other grants of the buyer", async () => {
    const a = await pendingTx({ accessType: "one_time" });
    const b = await pendingTx({ accessType: "per_video", mediaId: "m9" });
    await apply("payment.completed", a.ref);
    await apply("payment.completed", b.ref);
    await apply("payment.refunded", a.ref);
    const grants = await listEntitlementsForUser("buyer");
    expect(grants.map((g) => [g.type, g.status])).toEqual([
      ["one_time", "revoked"],
      ["per_video", "active"],
    ]);
  });

  it("an unknown provider reference is reported and nothing is recorded", async () => {
    expect(await apply("payment.completed", "nope", T0, "evt-x")).toBe("unknown_transaction");
    // Nothing recorded: once the reference exists, the same event id still applies.
    const tx = await createTransaction({
      buyerId: "buyer",
      creatorId: "creator1",
      accessType: "monthly",
      ...MONEY,
      provider: "fake",
      providerRef: "nope",
    });
    expect(await apply("payment.completed", "nope", T0, "evt-x")).toBe("applied");
    expect((await getTransaction(tx.id))!.status).toBe("completed");
  });

  it("looks the reference up per provider", async () => {
    const { ref } = await pendingTx();
    expect(await applyPaymentEvent("other", event("payment.completed", ref), T0)).toBe("unknown_transaction");
  });

  it("event ids are de-duplicated per provider", async () => {
    const { ref } = await pendingTx();
    const other = await createTransaction({
      buyerId: "buyer",
      creatorId: "creator1",
      accessType: "one_time",
      ...MONEY,
      provider: "other",
      providerRef: "o1",
    });
    expect(await apply("payment.completed", ref, T0, "shared")).toBe("applied");
    expect(await applyPaymentEvent("other", event("payment.completed", "o1", "shared"), T0)).toBe("applied");
    expect((await getTransaction(other.id))!.status).toBe("completed");
  });

  it("a repeat monthly stacks after the current term", async () => {
    const first = await pendingTx({ accessType: "monthly" });
    await apply("payment.completed", first.ref, T0);
    const second = await pendingTx({ accessType: "monthly" });
    await apply("payment.completed", second.ref, new Date(T0.getTime() + 10 * DAY));
    const grants = await listEntitlementsForUser("buyer");
    expect(grants[1]).toMatchObject({
      startsAt: new Date(T0.getTime() + 30 * DAY),
      endsAt: new Date(T0.getTime() + 60 * DAY),
    });
  });

  it("stacking only considers the buyer's grants for the same creator", async () => {
    await createEntitlement({
      userId: "buyer",
      scope: "creator",
      creatorId: "creatorB",
      type: "yearly",
      startsAt: T0,
      endsAt: new Date(T0.getTime() + 365 * DAY),
    });
    await createEntitlement({
      userId: "someone-else",
      scope: "creator",
      creatorId: "creator1",
      type: "yearly",
      startsAt: T0,
      endsAt: new Date(T0.getTime() + 365 * DAY),
    });
    const { tx, ref } = await pendingTx({ accessType: "monthly", creatorId: "creator1" });
    await apply("payment.completed", ref, T0);
    const linked = (await getTransaction(tx.id))!.entitlementId;
    const grant = (await listEntitlementsForUser("buyer")).find((g) => g.id === linked);
    expect(grant).toMatchObject({ creatorId: "creator1", startsAt: T0, endsAt: new Date(T0.getTime() + 30 * DAY) });
  });

  it("a revoked timed grant does not push out a new term", async () => {
    const first = await pendingTx({ accessType: "monthly" });
    await apply("payment.completed", first.ref, T0);
    await apply("payment.refunded", first.ref, T0);
    const second = await pendingTx({ accessType: "monthly" });
    await apply("payment.completed", second.ref, T0);
    const grants = await listEntitlementsForUser("buyer");
    expect(grants[1]).toMatchObject({ status: "active", startsAt: T0 });
  });

  it("access is denied once the monthly term has passed", async () => {
    const m = await createMedia({ ownerId: "creator1", type: "video", visibility: "private" });
    const live = (await updateMedia(m.id, { status: "live" }))!;
    const { ref } = await pendingTx({ accessType: "monthly" });
    await apply("payment.completed", ref, T0);
    expect(await hasMediaAccess("buyer", live, new Date(T0.getTime() + 29 * DAY))).toBe(true);
    expect(await hasMediaAccess("buyer", live, new Date(T0.getTime() + 30 * DAY))).toBe(false);
  });

  it("completes without a grant when the buyer account is gone", async () => {
    // A deleted buyer (Prisma onDelete SetNull) leaves a buyer-less transaction.
    const orphan = await createTransaction({
      buyerId: null,
      creatorId: "creator1",
      accessType: "monthly",
      ...MONEY,
      provider: "fake",
      providerRef: "orphan",
    });
    expect(await apply("payment.completed", "orphan")).toBe("applied");
    expect(await getTransaction(orphan.id)).toMatchObject({ status: "completed", entitlementId: null });
  });
});
