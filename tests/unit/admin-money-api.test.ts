import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));

import { POST as postPayouts } from "@/app/api/admin/money/payouts/route";
import { GET as getSplit, PUT as putSplit } from "@/app/api/admin/money/split/route";
import { applyPaymentEvent } from "@/lib/payments/reconcile";
import {
  createTransaction,
  getTransaction,
  resetMemoryPayments,
  setTransactionProviderRef,
} from "@/lib/payments/records";
import { getCreatorShareBps, resetMemoryPlatformSettings } from "@/lib/platform-settings";

const as = (role: string | null) =>
  getSession.mockResolvedValue(role ? { user: { id: `u_${role}`, role } } : null);
const req = (method: string, body?: unknown) =>
  new Request("http://x/api/admin/money", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

async function seedCompleted(creatorId: string, grossCents = 1000) {
  const tx = await createTransaction({
    buyerId: "buyer1",
    creatorId,
    accessType: "one_time",
    grossCents,
    platformFeeCents: grossCents - Math.floor(grossCents * 0.8),
    creatorEarningsCents: Math.floor(grossCents * 0.8),
    creatorShareBps: 8000,
    provider: "fake",
  });
  await setTransactionProviderRef(tx.id, `ref_${tx.id}`);
  await applyPaymentEvent("fake", { eventId: `ev_${tx.id}`, type: "payment.completed", providerRef: `ref_${tx.id}` });
  return tx;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", undefined);
  resetMemoryPayments();
  resetMemoryPlatformSettings();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth matrix", () => {
  it("401s every endpoint without a session", async () => {
    as(null);
    expect((await getSplit()).status).toBe(401);
    expect((await putSplit(req("PUT", { creatorShareBps: 7500 }))).status).toBe(401);
    expect((await postPayouts(req("POST", { creatorId: "c1" }))).status).toBe(401);
  });

  it("403s viewers and creators everywhere", async () => {
    for (const role of ["viewer", "creator"]) {
      as(role);
      expect((await getSplit()).status).toBe(403);
      expect((await putSplit(req("PUT", { creatorShareBps: 7500 }))).status).toBe(403);
      expect((await postPayouts(req("POST", { creatorId: "c1" }))).status).toBe(403);
    }
  });

  it("lets staff read the split but not change it or mark payouts", async () => {
    as("staff");
    expect((await getSplit()).status).toBe(200);
    expect((await putSplit(req("PUT", { creatorShareBps: 7500 }))).status).toBe(403);
    expect(await getCreatorShareBps()).toBe(8000);
    await seedCompleted("c1");
    expect((await postPayouts(req("POST", { creatorId: "c1" }))).status).toBe(403);
    expect((await (await getSplit()).json()).creatorShareBps).toBe(8000);
  });
});

describe("/api/admin/money/split", () => {
  it("GET returns the current split with its bounds", async () => {
    as("admin");
    const res = await getSplit();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ creatorShareBps: 8000, min: 7000, max: 8000 });
  });

  it("PUT stores a valid split and returns it", async () => {
    as("admin");
    const res = await putSplit(req("PUT", { creatorShareBps: 7000 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ creatorShareBps: 7000, min: 7000, max: 8000 });
    expect(await getCreatorShareBps()).toBe(7000);
  });

  it("PUT 400s on invalid JSON, out-of-range or non-integer values and stores nothing", async () => {
    as("admin");
    for (const body of ["{bad", null, [], {}, { creatorShareBps: 6999 }, { creatorShareBps: 8001 }, { creatorShareBps: 7500.5 }, { creatorShareBps: "7500" }]) {
      expect((await putSplit(req("PUT", body))).status).toBe(400);
    }
    expect(await getCreatorShareBps()).toBe(8000);
  });
});

describe("POST /api/admin/money/payouts", () => {
  it("marks the creator's completed unpaid earnings paid; a repeat marks nothing", async () => {
    as("admin");
    const a = await seedCompleted("c1", 1000);
    await seedCompleted("c1", 500);
    const other = await seedCompleted("c2", 1000);
    const res = await postPayouts(req("POST", { creatorId: "c1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ markedCount: 2, paidCents: 1200 });
    expect(await getTransaction(a.id)).toMatchObject({ payoutStatus: "paid" });
    expect(await getTransaction(other.id)).toMatchObject({ payoutStatus: "unpaid" });
    expect(await (await postPayouts(req("POST", { creatorId: "c1" }))).json()).toEqual({ markedCount: 0, paidCents: 0 });
  });

  it("with asOf, marks only what had completed by then (what the admin confirmed)", async () => {
    as("admin");
    const confirmed = await seedCompleted("c1", 1000);
    const asOf = new Date(Date.now() + 1).toISOString();
    await new Promise((r) => setTimeout(r, 5));
    const later = await seedCompleted("c1", 500);
    const res = await postPayouts(req("POST", { creatorId: "c1", asOf }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ markedCount: 1, paidCents: 800 });
    expect(await getTransaction(confirmed.id)).toMatchObject({ payoutStatus: "paid" });
    expect(await getTransaction(later.id)).toMatchObject({ payoutStatus: "unpaid" });
  });

  it("400s on invalid JSON, a missing/blank creatorId or an invalid asOf", async () => {
    as("admin");
    await seedCompleted("c1");
    for (const body of [
      "{bad",
      null,
      [],
      {},
      { creatorId: "" },
      { creatorId: "  " },
      { creatorId: 5 },
      { creatorId: "c1", asOf: "yesterday" },
      { creatorId: "c1", asOf: 1700000000000 },
      { creatorId: "c1", asOf: null },
    ]) {
      expect((await postPayouts(req("POST", body))).status).toBe(400);
    }
    expect(await (await postPayouts(req("POST", { creatorId: "c1" }))).json()).toEqual({ markedCount: 1, paidCents: 800 });
  });
});
