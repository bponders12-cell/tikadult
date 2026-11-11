import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { jsonError, readJson, requireUserId } from "@/lib/media/api";
import { getFakeCheckoutProvider } from "@/lib/payments/fake-checkout";
import { FAKE_SIGNATURE_HEADER, signFakeWebhook } from "@/lib/payments/provider";
import { receiveWebhook } from "@/lib/payments/reconcile";
import { getTransaction } from "@/lib/payments/records";

const OUTCOMES = ["completed", "failed", "refunded", "chargeback"] as const;
type Outcome = (typeof OUTCOMES)[number];
const isOutcome = (v: unknown): v is Outcome => (OUTCOMES as readonly unknown[]).includes(v);

/**
 * Dev-only stand-in for the provider's hosted payment page. Body: { transactionId, outcome }.
 * Builds a fresh signed event and sends it through the same verify-and-apply path as the webhook.
 */
export async function POST(request: Request) {
  const provider = getFakeCheckoutProvider();
  if (!provider) return jsonError("Not found", 404);
  const userId = await requireUserId();
  if (!userId) return jsonError("Unauthorized", 401);

  const parsed = await readJson(request);
  if (!parsed.ok) return jsonError("Invalid JSON", 400);
  const body = parsed.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request", 400);
  const { transactionId, outcome } = body as Record<string, unknown>;
  if (typeof transactionId !== "string" || !isOutcome(outcome)) return jsonError("Invalid request", 400);

  const tx = await getTransaction(transactionId);
  if (!tx || tx.buyerId !== userId || tx.provider !== provider.name) return jsonError("Not found", 404);
  if (!tx.providerRef) return jsonError("Checkout was not started", 409);

  const rawBody = JSON.stringify({ eventId: `sim_${randomUUID()}`, type: `payment.${outcome}`, providerRef: tx.providerRef });
  const headers = new Headers({ [FAKE_SIGNATURE_HEADER]: signFakeWebhook(rawBody) });
  const result = await receiveWebhook(provider, rawBody, headers);
  if (result === "invalid") return jsonError("Simulated event failed verification", 500);
  if (result === "unknown_transaction") return jsonError("Not found", 404);
  return NextResponse.json({ result, status: (await getTransaction(tx.id))!.status });
}
