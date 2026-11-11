import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));
const useCase = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/lib/payments/checkout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/checkout")>();
  return {
    ...actual,
    createCheckout: (input: Parameters<typeof actual.createCheckout>[0]) => {
      useCase.calls.push(input);
      return actual.createCheckout(input);
    },
  };
});

import { POST as checkout } from "@/app/api/payments/checkout/route";
import { GET as getTx } from "@/app/api/payments/transactions/[id]/route";
import { GET as getPricing, PUT as putPricing } from "@/app/api/payments/pricing/route";
import { getCreatorPricing, resetMemoryPricing, setCreatorPricing } from "@/lib/payments/pricing";
import { createTransaction, getTransaction, resetMemoryPayments } from "@/lib/payments/records";
import { resetMemoryPlatformSettings } from "@/lib/platform-settings";
import { createMedia, resetMemoryMedia, updateMedia } from "@/lib/media/records";

const as = (id: string | null) => getSession.mockResolvedValue(id ? { user: { id, role: "user" } } : null);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const postCheckout = (body: unknown, url = "http://local.test/api/payments/checkout") =>
  checkout(req(url, "POST", body));
const NONE = { monthlyPriceCents: null, yearlyPriceCents: null, oneTimePriceCents: null };

async function seedPrivate(price: number | null = 499) {
  const m = await createMedia({ ownerId: "creator1", type: "video", visibility: "private", unlockPriceCents: price });
  await updateMedia(m.id, { status: "live", processingStatus: "ready" });
  return m;
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("PAYMENT_PROVIDER", undefined);
  vi.stubEnv("NEXTAUTH_URL", undefined);
  resetMemoryMedia();
  resetMemoryPayments();
  resetMemoryPricing();
  resetMemoryPlatformSettings();
  as("buyer");
  useCase.calls.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth", () => {
  it("401s every endpoint without a session", async () => {
    as(null);
    expect((await postCheckout({ accessType: "monthly", creatorId: "c" })).status).toBe(401);
    expect((await getTx(req("http://x", "GET"), ctx("t"))).status).toBe(401);
    expect((await getPricing()).status).toBe(401);
    expect((await putPricing(req("http://x", "PUT", NONE))).status).toBe(401);
  });
});

describe("POST /api/payments/checkout", () => {
  it("creates a checkout and returns the redirect, with result URLs on the request origin", async () => {
    const m = await seedPrivate();
    const res = await postCheckout({ accessType: "per_video", mediaId: m.id });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ transactionId: expect.any(String), redirectUrl: `/checkout/fake?tx=${data.transactionId}` });
    expect(await getTransaction(data.transactionId)).toMatchObject({ status: "pending", buyerId: "buyer" });
  });

  it("passes the session user and request origin to the use case", async () => {
    const m = await seedPrivate();
    await postCheckout({ accessType: "per_video", mediaId: m.id, buyerId: "spoofed" });
    expect(useCase.calls.at(-1)).toEqual({
      buyerId: "buyer",
      accessType: "per_video",
      creatorId: undefined,
      mediaId: m.id,
      origin: "http://local.test",
    });
  });

  it("uses NEXTAUTH_URL as origin when set", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://public.example");
    await setCreatorPricing("creator1", { ...NONE, monthlyPriceCents: 999 });
    const res = await postCheckout({ accessType: "monthly", creatorId: "creator1" }, "http://internal:3000/api/x");
    expect(res.status).toBe(201);
    expect(useCase.calls.at(-1)).toMatchObject({ origin: "https://public.example", creatorId: "creator1" });
  });

  it("400s on invalid JSON or shape", async () => {
    expect((await postCheckout("{nope")).status).toBe(400);
    expect((await postCheckout(null)).status).toBe(400);
    expect((await postCheckout([])).status).toBe(400);
    expect((await postCheckout({ accessType: "lifetime", creatorId: "c" })).status).toBe(400);
    expect((await postCheckout({ accessType: "monthly", creatorId: 5 })).status).toBe(400);
    expect((await postCheckout({ accessType: "per_video", mediaId: ["x"] })).status).toBe(400);
  });

  it("maps use-case errors to status codes", async () => {
    expect((await postCheckout({ accessType: "per_video", mediaId: "missing" })).status).toBe(404);
    expect((await postCheckout({ accessType: "monthly", creatorId: "creator1" })).status).toBe(400);
    const m = await seedPrivate();
    as("creator1");
    const res = await postCheckout({ accessType: "per_video", mediaId: m.id });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toEqual(expect.any(String));
  });

  it("503s when payments are not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setCreatorPricing("creator1", { ...NONE, monthlyPriceCents: 999 });
    const res = await postCheckout({ accessType: "monthly", creatorId: "creator1" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not available/i);
  });
});

describe("GET /api/payments/transactions/[id]", () => {
  async function seedTx(buyerId: string | null) {
    return createTransaction({
      buyerId,
      creatorId: "creator1",
      mediaId: null,
      accessType: "monthly",
      grossCents: 999,
      platformFeeCents: 200,
      creatorEarningsCents: 799,
      creatorShareBps: 8000,
      provider: "fake",
    });
  }

  it("returns the buyer's own transaction (limited fields)", async () => {
    const tx = await seedTx("buyer");
    const res = await getTx(req("http://x", "GET"), ctx(tx.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      transaction: {
        id: tx.id,
        status: "pending",
        accessType: "monthly",
        grossCents: 999,
        currency: "USD",
        creatorId: "creator1",
        mediaId: null,
      },
    });
  });

  it("404s for someone else's or an unknown transaction", async () => {
    const tx = await seedTx("other");
    expect((await getTx(req("http://x", "GET"), ctx(tx.id))).status).toBe(404);
    expect((await getTx(req("http://x", "GET"), ctx("unknown"))).status).toBe(404);
    const orphan = await seedTx(null);
    expect((await getTx(req("http://x", "GET"), ctx(orphan.id))).status).toBe(404);
  });
});

describe("/api/payments/pricing", () => {
  it("GET returns the signed-in user's pricing (all null by default)", async () => {
    const res = await getPricing();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pricing: NONE });
  });

  it("PUT stores the signed-in user's pricing", async () => {
    const pricing = { monthlyPriceCents: 999, yearlyPriceCents: null, oneTimePriceCents: 2500 };
    const res = await putPricing(req("http://x", "PUT", pricing));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pricing });
    expect(await getCreatorPricing("buyer")).toEqual(pricing);
    expect(await (await getPricing()).json()).toEqual({ pricing });
  });

  it("PUT 400s on invalid JSON or values and stores nothing", async () => {
    expect((await putPricing(req("http://x", "PUT", "{bad"))).status).toBe(400);
    expect((await putPricing(req("http://x", "PUT", { monthlyPriceCents: 0 }))).status).toBe(400);
    expect((await putPricing(req("http://x", "PUT", { yearlyPriceCents: 1.5 }))).status).toBe(400);
    expect(await getCreatorPricing("buyer")).toEqual(NONE);
  });
});
