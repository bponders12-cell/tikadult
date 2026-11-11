import { createHmac, timingSafeEqual } from "crypto";

/**
 * Payment provider abstraction. The only implementation is the fake provider (dev/test); no real
 * provider is wired up. Nothing here reads configuration at module load: `next build` runs with
 * NODE_ENV=production, so every production guard is evaluated lazily inside getPaymentProvider().
 */

export type PaymentEventType =
  | "payment.completed"
  | "payment.failed"
  | "payment.refunded"
  | "payment.chargeback";

export type PaymentEvent = { eventId: string; type: PaymentEventType; providerRef: string };

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: {
    transactionId: string;
    amountCents: number;
    currency: "USD";
    description: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
  /** Verifies authenticity of a webhook delivery. Returns null when the signature/body is invalid. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent | null>;
}

/** Payments cannot be offered in this environment (provider, secret or durable storage missing). */
export class PaymentsNotConfiguredError extends Error {
  constructor(reason: string) {
    super(`Payments are not configured: ${reason}`);
    this.name = "PaymentsNotConfiguredError";
  }
}

export const PAYMENT_EVENT_TYPES: readonly PaymentEventType[] = [
  "payment.completed",
  "payment.failed",
  "payment.refunded",
  "payment.chargeback",
];

export const FAKE_PROVIDER_NAME = "fake";
export const FAKE_SIGNATURE_HEADER = "x-fake-signature";
const DEV_WEBHOOK_SECRET = "dev-only-fake-payments-webhook-secret";

const isProduction = () => process.env.NODE_ENV === "production";

/** PAYMENTS_WEBHOOK_SECRET; a fixed dev default outside production; throws in production when unset. */
export function getWebhookSecret(): string {
  const secret = process.env.PAYMENTS_WEBHOOK_SECRET;
  if (secret) return secret;
  if (isProduction()) throw new PaymentsNotConfiguredError("PAYMENTS_WEBHOOK_SECRET is not set");
  return DEV_WEBHOOK_SECRET;
}

/** Hex HMAC-SHA256 of the raw body: the fake provider's `x-fake-signature` value. */
export function signFakeWebhook(rawBody: string, secret: string = getWebhookSecret()): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function toPaymentEvent(value: unknown): PaymentEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { eventId, type, providerRef } = value as Record<string, unknown>;
  if (typeof eventId !== "string" || eventId.length === 0) return null;
  if (typeof providerRef !== "string" || providerRef.length === 0) return null;
  if (typeof type !== "string" || !(PAYMENT_EVENT_TYPES as readonly string[]).includes(type)) return null;
  return { eventId, type: type as PaymentEventType, providerRef };
}

/** Fake provider: no money moves; the "hosted" page is /checkout/fake (built in a later task). */
export function createFakeProvider(secret: string): PaymentProvider {
  return {
    name: FAKE_PROVIDER_NAME,
    async createCheckout({ transactionId }) {
      return {
        providerRef: `fake_${transactionId}`,
        redirectUrl: `/checkout/fake?tx=${encodeURIComponent(transactionId)}`,
      };
    },
    async parseWebhook(rawBody, headers) {
      const signature = headers.get(FAKE_SIGNATURE_HEADER);
      if (!signature || !safeEqual(signature, signFakeWebhook(rawBody, secret))) return null;
      try {
        return toPaymentEvent(JSON.parse(rawBody));
      } catch {
        return null;
      }
    },
  };
}

/**
 * Resolves the configured provider from PAYMENT_PROVIDER (default "fake" outside production).
 * Throws PaymentsNotConfiguredError in production without DATABASE_URL or PAYMENTS_WEBHOOK_SECRET,
 * for the fake provider in production, and for any unknown provider name.
 */
export function getPaymentProvider(): PaymentProvider {
  const production = isProduction();
  if (production && !process.env.DATABASE_URL) {
    throw new PaymentsNotConfiguredError("DATABASE_URL is required for durable payment records");
  }
  const secret = getWebhookSecret();
  const name = process.env.PAYMENT_PROVIDER || (production ? "" : FAKE_PROVIDER_NAME);
  if (name === FAKE_PROVIDER_NAME) {
    if (production) throw new PaymentsNotConfiguredError("the fake provider is disabled in production");
    return createFakeProvider(secret);
  }
  throw new PaymentsNotConfiguredError(name ? `unknown provider "${name}"` : "PAYMENT_PROVIDER is not set");
}
