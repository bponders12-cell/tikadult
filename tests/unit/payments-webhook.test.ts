import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));

import { POST as webhook } from "@/app/api/webhooks/payments/[provider]/route";
import { POST as simulate } from "@/app/api/payments/fake/simulate/route";
import { FAKE_SIGNATURE_HEADER, signFakeWebhook } from "@/lib/payments/provider";
import {
  createTransaction,
  getTransaction,
  listEntitlementsForUser,
  resetMemoryPayments,
} from "@/lib/payments/records";

const MONEY = { grossCents: 999, platformFeeCents: 200, creatorEarningsCents: 799, creatorShareBps: 8000 };
const as = (id: string | null) => getSession.mockResolvedValue(id ? { user: { id, role: "viewer" } } : null);

async function pendingTx(providerRef: string | null = "fake_ref1", buyerId = "buyer") {
  return createTransaction({
    buyerId,
    creatorId: "creator1",
    accessType: "one_time",
    ...MONEY,
    provider: "fake",
    providerRef,
  });
}

function deliver(body: string, opts: { provider?: string; signature?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const sig = opts.signature === undefined ? signFakeWebhook(body) : opts.signature;
  if (sig !== null) headers[FAKE_SIGNATURE_HEADER] = sig;
  return webhook(new Request("http://x/api/webhooks/payments/fake", { method: "POST", headers, body }), {
    params: Promise.resolve({ provider: opts.provider ?? "fake" }),
  });
}
const completed = (eventId = "evt1", providerRef = "fake_ref1") =>
  JSON.stringify({ eventId, type: "payment.completed", providerRef });

const sim = (body: unknown) =>
  simulate(
    new Request("http://x/api/payments/fake/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("PAYMENT_PROVIDER", undefined);
  vi.stubEnv("PAYMENTS_WEBHOOK_SECRET", undefined);
  resetMemoryPayments();
  as(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/payments/[provider]", () => {
  it("applies a validly signed event: 200 and a grant", async () => {
    const tx = await pendingTx();
    const res = await deliver(completed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "applied" });
    expect((await getTransaction(tx.id))!.status).toBe("completed");
    expect(await listEntitlementsForUser("buyer")).toHaveLength(1);
  });

  it("answers a redelivered event with 200 and no second grant", async () => {
    await pendingTx();
    await deliver(completed());
    const res = await deliver(completed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: "duplicate" });
    const other = await deliver(completed("evt2"));
    expect(await other.json()).toEqual({ received: true, result: "ignored" });
    expect(await listEntitlementsForUser("buyer")).toHaveLength(1);
  });

  it("400s a bad or missing signature and changes nothing", async () => {
    const tx = await pendingTx();
    expect((await deliver(completed(), { signature: "0".repeat(64) })).status).toBe(400);
    expect((await deliver(completed(), { signature: signFakeWebhook(completed(), "wrong-secret") })).status).toBe(400);
    expect((await deliver(completed(), { signature: null })).status).toBe(400);
    expect((await getTransaction(tx.id))!.status).toBe("pending");
  });

  it("404s a provider name other than the configured one", async () => {
    await pendingTx();
    const res = await deliver(completed(), { provider: "stripe" });
    expect(res.status).toBe(404);
    expect(await listEntitlementsForUser("buyer")).toHaveLength(0);
  });

  it("404s an unknown transaction reference so the provider retries", async () => {
    const res = await deliver(completed("evt1", "fake_unknown"));
    expect(res.status).toBe(404);
  });

  it("413s bodies over 65536 bytes", async () => {
    await pendingTx();
    const big = JSON.stringify({ eventId: "e", type: "payment.completed", providerRef: "fake_ref1", pad: "x".repeat(65536) });
    const res = await deliver(big);
    expect(res.status).toBe(413);
    expect(await listEntitlementsForUser("buyer")).toHaveLength(0);
  });

  it("accepts a body of exactly 65536 bytes", async () => {
    await pendingTx();
    const base = JSON.stringify({ eventId: "e", type: "payment.completed", providerRef: "fake_ref1", pad: "" });
    const body = base.replace('"pad":""', `"pad":"${"x".repeat(65536 - base.length)}"`);
    expect(Buffer.byteLength(body)).toBe(65536);
    expect((await deliver(body)).status).toBe(200);
  });

  it("503s when payments are not configured", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "nope");
    const res = await deliver(completed());
    expect(res.status).toBe(503);
  });
});

describe("POST /api/payments/fake/simulate", () => {
  it("401s without a session", async () => {
    const tx = await pendingTx();
    expect((await sim({ transactionId: tx.id, outcome: "completed" })).status).toBe(401);
  });

  it("404s for anyone but the buyer and changes nothing", async () => {
    const tx = await pendingTx();
    as("intruder");
    expect((await sim({ transactionId: tx.id, outcome: "completed" })).status).toBe(404);
    expect((await sim({ transactionId: "missing", outcome: "completed" })).status).toBe(404);
    expect((await getTransaction(tx.id))!.status).toBe("pending");
  });

  it("404s in production even with a session", async () => {
    const tx = await pendingTx();
    as("buyer");
    vi.stubEnv("NODE_ENV", "production");
    expect((await sim({ transactionId: tx.id, outcome: "completed" })).status).toBe(404);
    expect((await getTransaction(tx.id))!.status).toBe("pending");
  });

  it("404s when the configured provider is not the fake one", async () => {
    const tx = await pendingTx();
    as("buyer");
    vi.stubEnv("PAYMENT_PROVIDER", "other");
    expect((await sim({ transactionId: tx.id, outcome: "completed" })).status).toBe(404);
  });

  it("400s an invalid body", async () => {
    const tx = await pendingTx();
    as("buyer");
    expect((await sim("not json")).status).toBe(400);
    expect((await sim({ transactionId: tx.id, outcome: "maybe" })).status).toBe(400);
    expect((await sim({ outcome: "completed" })).status).toBe(400);
  });

  it("409s a transaction whose checkout never got a provider reference", async () => {
    const tx = await pendingTx(null);
    as("buyer");
    expect((await sim({ transactionId: tx.id, outcome: "completed" })).status).toBe(409);
  });

  it("success path: signs a fresh event and runs it through the webhook pipeline", async () => {
    const tx = await pendingTx();
    as("buyer");
    const res = await sim({ transactionId: tx.id, outcome: "completed" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "applied", status: "completed" });
    expect(await listEntitlementsForUser("buyer")).toHaveLength(1);

    // Each simulation is a distinct event: a repeat is ignored, not a second grant.
    const again = await sim({ transactionId: tx.id, outcome: "completed" });
    expect(await again.json()).toEqual({ result: "ignored", status: "completed" });

    const refund = await sim({ transactionId: tx.id, outcome: "refunded" });
    expect(await refund.json()).toEqual({ result: "applied", status: "refunded" });
    expect((await listEntitlementsForUser("buyer"))[0].status).toBe("revoked");
  });

  it("verifies with the configured webhook secret (no shortcut around verification)", async () => {
    vi.stubEnv("PAYMENTS_WEBHOOK_SECRET", "custom-secret");
    const tx = await pendingTx();
    as("buyer");
    const res = await sim({ transactionId: tx.id, outcome: "failed" });
    expect(await res.json()).toEqual({ result: "applied", status: "failed" });
  });
});
