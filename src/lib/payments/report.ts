import {
  listTransactions,
  sumCompletedByAccessType,
  sumCompletedByCreatorAndPayout,
  sumPaidOutReversals,
  sumTransactionsByStatus,
  type AccessType,
  type CreatedAtRange,
  type TransactionRecord,
} from "@/lib/payments/records";

/**
 * Admin money-flow report. Every amount is a sum of the split stored on each transaction when it was
 * created — never recomputed from the current setting. All values are plain numbers (no BigInt).
 */

export const RECENT_TRANSACTIONS_LIMIT = 50;

export type CountAndGross = { count: number; grossCents: number };

/** A reversed (refunded / charged-back) bucket, plus the part whose creator earnings were already paid out. */
export type ReversalSums = CountAndGross & {
  /** Reversed transactions that had already been marked paid out to the creator. */
  paidOutCount: number;
  /** Creator earnings of those transactions: paid to the creator, then reversed. */
  paidOutCents: number;
};

export type CreatorMoneyRow = {
  /** null = the creator account was deleted after the purchase. */
  creatorId: string | null;
  count: number;
  grossCents: number;
  creatorEarningsCents: number;
  unpaidCents: number;
  paidCents: number;
};

export type MoneyFlowReport = {
  /** Transactions currently `completed`. */
  totals: { count: number; grossCents: number; platformFeeCents: number; creatorEarningsCents: number };
  refunded: ReversalSums;
  chargeback: ReversalSums;
  pending: { count: number };
  failed: { count: number };
  byAccessType: Record<AccessType, CountAndGross>;
  /**
   * Creator earnings of completed transactions by payout state. Earnings paid out and later reversed
   * are not here; they are `refunded.paidOutCents` / `chargeback.paidOutCents`.
   */
  payouts: { unpaidCents: number; paidCents: number };
  /** Sorted by unpaidCents descending. */
  byCreator: CreatorMoneyRow[];
  /** Latest transactions, newest first. */
  recent: TransactionRecord[];
};

/** `filter` applies to transaction `createdAt`: `from` inclusive, `to` exclusive. */
export async function getMoneyFlowReport(filter: CreatedAtRange = {}): Promise<MoneyFlowReport> {
  const range: CreatedAtRange = { from: filter.from, to: filter.to };
  const [byStatus, byAccess, creatorGroups, paidOutReversals, recent] = await Promise.all([
    sumTransactionsByStatus(range),
    sumCompletedByAccessType(range),
    sumCompletedByCreatorAndPayout(range),
    sumPaidOutReversals(range),
    listTransactions({ ...range, limit: RECENT_TRANSACTIONS_LIMIT }),
  ]);

  const creators = new Map<string | null, CreatorMoneyRow>();
  const payouts = { unpaidCents: 0, paidCents: 0 };
  for (const g of creatorGroups) {
    let row = creators.get(g.creatorId);
    if (!row) {
      row = { creatorId: g.creatorId, count: 0, grossCents: 0, creatorEarningsCents: 0, unpaidCents: 0, paidCents: 0 };
      creators.set(g.creatorId, row);
    }
    row.count += g.count;
    row.grossCents += g.grossCents;
    row.creatorEarningsCents += g.creatorEarningsCents;
    const key = g.payoutStatus === "paid" ? "paidCents" : "unpaidCents";
    row[key] += g.creatorEarningsCents;
    payouts[key] += g.creatorEarningsCents;
  }
  const byCreator = [...creators.values()].sort(
    (a, b) =>
      b.unpaidCents - a.unpaidCents ||
      b.grossCents - a.grossCents ||
      String(a.creatorId).localeCompare(String(b.creatorId)),
  );

  const countAndGross = ({ count, grossCents }: CountAndGross): CountAndGross => ({ count, grossCents });
  const reversal = (status: "refunded" | "chargeback"): ReversalSums => ({
    ...countAndGross(byStatus[status]),
    paidOutCount: paidOutReversals[status].count,
    paidOutCents: paidOutReversals[status].creatorEarningsCents,
  });
  const { completed } = byStatus;
  return {
    totals: {
      count: completed.count,
      grossCents: completed.grossCents,
      platformFeeCents: completed.platformFeeCents,
      creatorEarningsCents: completed.creatorEarningsCents,
    },
    refunded: reversal("refunded"),
    chargeback: reversal("chargeback"),
    pending: { count: byStatus.pending.count },
    failed: { count: byStatus.failed.count },
    byAccessType: {
      monthly: countAndGross(byAccess.monthly),
      yearly: countAndGross(byAccess.yearly),
      one_time: countAndGross(byAccess.one_time),
      per_video: countAndGross(byAccess.per_video),
    },
    payouts,
    byCreator,
    recent,
  };
}
