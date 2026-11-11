import { NextResponse } from "next/server";
import { jsonError } from "@/lib/media/api";
import { getPaymentProvider, PaymentsNotConfiguredError, type PaymentProvider } from "@/lib/payments/provider";
import { receiveWebhook } from "@/lib/payments/reconcile";

/** Provider events are small; anything larger is not a genuine delivery. */
export const MAX_WEBHOOK_BYTES = 65536;

type Ctx = { params: Promise<{ provider: string }> };

/**
 * Provider -> app payment events (no session; authenticity comes from the provider's signature).
 * 200 for applied/duplicate/ignored so the provider stops retrying; 404 for an unknown reference so
 * it retries an event that raced the storing of providerRef.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { provider: name } = await params;
  let provider: PaymentProvider;
  try {
    provider = getPaymentProvider();
  } catch (e) {
    if (e instanceof PaymentsNotConfiguredError) return jsonError("Payments are not configured", 503);
    throw e;
  }
  if (name !== provider.name) return jsonError("Not found", 404);

  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_WEBHOOK_BYTES) return jsonError("Payload too large", 413);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) return jsonError("Payload too large", 413);

  const result = await receiveWebhook(provider, rawBody, request.headers);
  if (result === "invalid") return jsonError("Invalid signature or payload", 400);
  if (result === "unknown_transaction") return jsonError("Unknown transaction", 404);
  return NextResponse.json({ received: true, result });
}
