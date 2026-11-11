import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAKE_SIGNATURE_HEADER,
  PaymentsNotConfiguredError,
  createFakeProvider,
  getPaymentProvider,
  signFakeWebhook,
} from "@/lib/payments/provider";

const SECRET = "test-secret";
const provider = createFakeProvider(SECRET);
const event = { eventId: "evt_1", type: "payment.completed", providerRef: "fake_tx1" };

function deliver(body: string, signature?: string | null) {
  const headers = new Headers();
  if (signature) headers.set(FAKE_SIGNATURE_HEADER, signature);
  return provider.parseWebhook(body, headers);
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PAYMENT_PROVIDER", undefined);
  vi.stubEnv("PAYMENTS_WEBHOOK_SECRET", undefined);
  vi.stubEnv("DATABASE_URL", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fake provider checkout", () => {
  it("returns a provider reference and the fake hosted page URL", async () => {
    const res = await provider.createCheckout({
      transactionId: "tx1",
      amountCents: 499,
      currency: "USD",
      description: "Unlock",
      successUrl: "http://x/checkout/result?tx=tx1",
      cancelUrl: "http://x/checkout/result?tx=tx1&cancelled=1",
    });
    expect(provider.name).toBe("fake");
    expect(res.providerRef).toBe("fake_tx1");
    expect(res.redirectUrl).toBe("/checkout/fake?tx=tx1");
  });

  it("URL-encodes the transaction id in the redirect", async () => {
    const res = await provider.createCheckout({
      transactionId: "a b&c",
      amountCents: 1,
      currency: "USD",
      description: "d",
      successUrl: "s",
      cancelUrl: "c",
    });
    expect(res.redirectUrl).toBe("/checkout/fake?tx=a%20b%26c");
  });
});

describe("fake provider webhooks", () => {
  it("signs with hex HMAC-SHA256 of the raw body", () => {
    const sig = signFakeWebhook("body", SECRET);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(signFakeWebhook("body", SECRET)).toBe(sig);
    expect(signFakeWebhook("body", "other")).not.toBe(sig);
  });

  it("accepts a correctly signed event and returns only the event fields", async () => {
    const body = JSON.stringify({ ...event, extra: "ignored" });
    expect(await deliver(body, signFakeWebhook(body, SECRET))).toEqual(event);
  });

  it("accepts every event type", async () => {
    for (const type of ["payment.completed", "payment.failed", "payment.refunded", "payment.chargeback"]) {
      const body = JSON.stringify({ ...event, type });
      expect(await deliver(body, signFakeWebhook(body, SECRET))).toEqual({ ...event, type });
    }
  });

  it("rejects a tampered body", async () => {
    const body = JSON.stringify(event);
    const sig = signFakeWebhook(body, SECRET);
    const tampered = JSON.stringify({ ...event, providerRef: "fake_other" });
    expect(await deliver(tampered, sig)).toBeNull();
  });

  it("rejects a wrong signature (other secret, garbage, wrong length)", async () => {
    const body = JSON.stringify(event);
    expect(await deliver(body, signFakeWebhook(body, "other"))).toBeNull();
    expect(await deliver(body, "nothex")).toBeNull();
    expect(await deliver(body, "0".repeat(64))).toBeNull();
  });

  it("rejects a missing signature header", async () => {
    expect(await deliver(JSON.stringify(event), null)).toBeNull();
  });

  it("rejects malformed JSON even when signed", async () => {
    const body = "{not json";
    expect(await deliver(body, signFakeWebhook(body, SECRET))).toBeNull();
  });

  it("rejects bodies that do not match the event shape", async () => {
    const bad = [
      "null",
      "[]",
      JSON.stringify({ ...event, type: "payment.unknown" }),
      JSON.stringify({ ...event, eventId: "" }),
      JSON.stringify({ ...event, providerRef: 5 }),
      JSON.stringify({ type: event.type, providerRef: event.providerRef }),
    ];
    for (const body of bad) {
      expect(await deliver(body, signFakeWebhook(body, SECRET))).toBeNull();
    }
  });
});

describe("getPaymentProvider", () => {
  it("defaults to the fake provider outside production", () => {
    expect(getPaymentProvider().name).toBe("fake");
    vi.stubEnv("PAYMENT_PROVIDER", "fake");
    expect(getPaymentProvider().name).toBe("fake");
  });

  it("uses a fixed dev secret outside production when none is set", async () => {
    const body = JSON.stringify(event);
    const p = getPaymentProvider();
    expect(await p.parseWebhook(body, new Headers({ [FAKE_SIGNATURE_HEADER]: signFakeWebhook(body) }))).toEqual(
      event,
    );
  });

  it("uses PAYMENTS_WEBHOOK_SECRET when set", async () => {
    vi.stubEnv("PAYMENTS_WEBHOOK_SECRET", "configured");
    const body = JSON.stringify(event);
    const p = getPaymentProvider();
    const sig = signFakeWebhook(body, "configured");
    expect(await p.parseWebhook(body, new Headers({ [FAKE_SIGNATURE_HEADER]: sig }))).toEqual(event);
    expect(signFakeWebhook(body)).toBe(sig);
  });

  it("throws for an unknown provider", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "acme");
    expect(() => getPaymentProvider()).toThrow(PaymentsNotConfiguredError);
  });

  it("refuses the fake provider in production, even when fully configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("PAYMENTS_WEBHOOK_SECRET", "s");
    expect(() => getPaymentProvider()).toThrow(PaymentsNotConfiguredError);
    vi.stubEnv("PAYMENT_PROVIDER", "fake");
    expect(() => getPaymentProvider()).toThrow(PaymentsNotConfiguredError);
  });

  it("refuses an unknown provider in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("PAYMENTS_WEBHOOK_SECRET", "s");
    vi.stubEnv("PAYMENT_PROVIDER", "acme");
    expect(() => getPaymentProvider()).toThrow(PaymentsNotConfiguredError);
  });

  it("requires DATABASE_URL in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_WEBHOOK_SECRET", "s");
    expect(() => getPaymentProvider()).toThrow(/DATABASE_URL/);
  });

  it("requires PAYMENTS_WEBHOOK_SECRET in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    expect(() => getPaymentProvider()).toThrow(/PAYMENTS_WEBHOOK_SECRET/);
    expect(() => signFakeWebhook("body")).toThrow(PaymentsNotConfiguredError);
  });

  it("is lazy: importing the module under production does not throw", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const mod = await import("@/lib/payments/provider");
    expect(typeof mod.getPaymentProvider).toBe("function");
    expect(() => mod.getPaymentProvider()).toThrow(mod.PaymentsNotConfiguredError);
  });
});
