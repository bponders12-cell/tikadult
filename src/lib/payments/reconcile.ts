import { computeTerm } from "@/lib/payments/entitlements";
import type { PaymentEvent, PaymentEventType, PaymentProvider } from "@/lib/payments/provider";
import {
  settlePaymentEvent,
  type CreateEntitlementInput,
  type EntitlementRecord,
  type SettlementPlan,
  type SettlementResult,
  type TransactionRecord,
} from "@/lib/payments/records";

/**
 * Turns verified provider events into transaction status changes and entitlement grants/revocations.
 * Lifecycle: pending -> completed | failed; failed -> completed; completed -> refunded | chargeback.
 * Anything else (duplicate, out-of-order, unknown reference) is a no-op, never an error.
 */

export type ReconcileResult = SettlementResult;

/** The grant a completed transaction earns; null when there is nobody or nothing to grant to. */
function grantFor(
  tx: TransactionRecord,
  creatorGrants: readonly EntitlementRecord[],
  now: Date,
): CreateEntitlementInput | null {
  if (!tx.buyerId) return null; // buyer account deleted (SetNull): the money still settled
  const target =
    tx.accessType === "per_video"
      ? tx.mediaId && { scope: "media" as const, mediaId: tx.mediaId }
      : tx.creatorId && { scope: "creator" as const, creatorId: tx.creatorId };
  if (!target) return null;
  // Only this buyer's grants for this creator may push out the new term (see computeTerm).
  const term = computeTerm(tx.accessType, now, creatorGrants);
  return { userId: tx.buyerId, type: tx.accessType, ...target, ...term };
}

/** The lifecycle as a pure function: the transition `type` asks of `tx`, or null if not allowed. */
export function planSettlement(
  type: PaymentEventType,
  tx: TransactionRecord,
  creatorGrants: readonly EntitlementRecord[],
  now: Date,
): SettlementPlan | null {
  switch (type) {
    case "payment.completed":
      return tx.status === "pending" || tx.status === "failed"
        ? { to: "completed", from: tx.status, completedAt: now, grant: grantFor(tx, creatorGrants, now) }
        : null;
    case "payment.failed":
      return tx.status === "pending" ? { to: "failed", from: "pending" } : null;
    case "payment.refunded":
      return tx.status === "completed" ? { to: "refunded", from: "completed" } : null;
    case "payment.chargeback":
      return tx.status === "completed" ? { to: "chargeback", from: "completed" } : null;
  }
}

/** Applies one verified event idempotently. */
export function applyPaymentEvent(
  providerName: string,
  event: PaymentEvent,
  now: Date = new Date(),
): Promise<ReconcileResult> {
  return settlePaymentEvent(
    { provider: providerName, eventId: event.eventId, type: event.type, providerRef: event.providerRef },
    (tx, creatorGrants) => planSettlement(event.type, tx, creatorGrants, now),
  );
}

/**
 * The single webhook pipeline: verify with the provider, then apply. Used by the webhook route and
 * the dev-only fake checkout simulator alike, so nothing can skip verification.
 */
export async function receiveWebhook(
  provider: PaymentProvider,
  rawBody: string,
  headers: Headers,
): Promise<ReconcileResult | "invalid"> {
  const event = await provider.parseWebhook(rawBody, headers);
  if (!event) return "invalid";
  return applyPaymentEvent(provider.name, event);
}
