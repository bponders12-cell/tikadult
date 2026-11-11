import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

/**
 * Transaction + entitlement records with dual backing (same pattern as src/lib/media/records.ts):
 * Prisma when DATABASE_URL is set, otherwise a process-local in-memory Map (not durable; dev/test only).
 * Prisma errors propagate; they are never swallowed into memory.
 *
 * Money is integer cents. Transaction money columns are BigInt in Postgres; the conversion to
 * `number` happens only in this file, so no BigInt leaves the records layer.
 * Status transitions happen only through settlePaymentEvent (one atomic unit per provider event).
 */

export type AccessType = "monthly" | "yearly" | "one_time" | "per_video";
export type EntitlementScope = "creator" | "media";
export type EntitlementStatus = "active" | "expired" | "revoked";
export type TransactionStatus = "pending" | "completed" | "failed" | "refunded" | "chargeback";
export type PayoutStatus = "unpaid" | "paid";

export type EntitlementRecord = {
  id: string;
  userId: string;
  scope: EntitlementScope;
  creatorId: string | null;
  mediaId: string | null;
  type: AccessType;
  status: EntitlementStatus;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TransactionRecord = {
  id: string;
  buyerId: string | null;
  creatorId: string | null;
  mediaId: string | null;
  accessType: AccessType;
  grossCents: number;
  platformFeeCents: number;
  creatorEarningsCents: number;
  creatorShareBps: number;
  currency: "USD";
  status: TransactionStatus;
  provider: string;
  providerRef: string | null;
  entitlementId: string | null;
  payoutStatus: PayoutStatus;
  paidOutAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTransactionInput = {
  buyerId: string | null;
  creatorId: string | null;
  mediaId?: string | null;
  accessType: AccessType;
  grossCents: number;
  platformFeeCents: number;
  creatorEarningsCents: number;
  creatorShareBps: number;
  provider: string;
  providerRef?: string | null;
};

export type CreateEntitlementInput = {
  userId: string;
  scope: EntitlementScope;
  creatorId?: string | null;
  mediaId?: string | null;
  type: AccessType;
  startsAt: Date;
  endsAt: Date | null;
};

export type TransactionFilter = {
  status?: TransactionStatus;
  creatorId?: string;
  buyerId?: string;
};

const memoryTransactions = new Map<string, TransactionRecord>();
const memoryEntitlements = new Map<string, EntitlementRecord>();
/** Seen provider events, keyed by eventKey(provider, eventId). */
const memoryPaymentEvents = new Set<string>();

/** Test helper: clears the in-memory stores. */
export function resetMemoryPayments(): void {
  memoryTransactions.clear();
  memoryEntitlements.clear();
  memoryPaymentEvents.clear();
}

function dbAvailable(): boolean {
  return typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0;
}

const cloneTx = (t: TransactionRecord): TransactionRecord => ({
  ...t,
  paidOutAt: t.paidOutAt ? new Date(t.paidOutAt) : null,
  completedAt: t.completedAt ? new Date(t.completedAt) : null,
  createdAt: new Date(t.createdAt),
  updatedAt: new Date(t.updatedAt),
});

const cloneEnt = (e: EntitlementRecord): EntitlementRecord => ({
  ...e,
  startsAt: new Date(e.startsAt),
  endsAt: e.endsAt ? new Date(e.endsAt) : null,
  createdAt: new Date(e.createdAt),
  updatedAt: new Date(e.updatedAt),
});

// ---- Prisma mapping -------------------------------------------------------

type PrismaTransactionRow = NonNullable<Awaited<ReturnType<typeof prisma.transaction.findUnique>>>;
type PrismaEntitlementRow = NonNullable<Awaited<ReturnType<typeof prisma.entitlement.findUnique>>>;

function txFromRow(row: PrismaTransactionRow): TransactionRecord {
  return {
    id: row.id,
    buyerId: row.buyerId,
    creatorId: row.creatorId,
    mediaId: row.mediaId,
    accessType: row.accessType as AccessType,
    grossCents: Number(row.grossCents),
    platformFeeCents: Number(row.platformFeeCents),
    creatorEarningsCents: Number(row.creatorEarningsCents),
    creatorShareBps: row.creatorShareBps,
    currency: "USD",
    status: row.status as TransactionStatus,
    provider: row.provider,
    providerRef: row.providerRef,
    entitlementId: row.entitlementId,
    payoutStatus: row.payoutStatus as PayoutStatus,
    paidOutAt: row.paidOutAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function entFromRow(row: PrismaEntitlementRow): EntitlementRecord {
  return {
    id: row.id,
    userId: row.userId,
    scope: row.scope as EntitlementScope,
    creatorId: row.creatorId,
    mediaId: row.mediaId,
    type: row.type as AccessType,
    status: row.status as EntitlementStatus,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---- Transactions ---------------------------------------------------------

/** Creates a `pending`, `unpaid` USD transaction. The split must already be computed by the caller. */
export async function createTransaction(input: CreateTransactionInput): Promise<TransactionRecord> {
  if (dbAvailable()) {
    const row = await prisma.transaction.create({
      data: {
        buyerId: input.buyerId,
        creatorId: input.creatorId,
        mediaId: input.mediaId ?? null,
        accessType: input.accessType,
        grossCents: BigInt(input.grossCents),
        platformFeeCents: BigInt(input.platformFeeCents),
        creatorEarningsCents: BigInt(input.creatorEarningsCents),
        creatorShareBps: input.creatorShareBps,
        currency: "USD",
        status: "pending",
        provider: input.provider,
        providerRef: input.providerRef ?? null,
        payoutStatus: "unpaid",
      },
    });
    return txFromRow(row);
  }
  const now = new Date();
  const record: TransactionRecord = {
    id: randomUUID(),
    buyerId: input.buyerId,
    creatorId: input.creatorId,
    mediaId: input.mediaId ?? null,
    accessType: input.accessType,
    grossCents: input.grossCents,
    platformFeeCents: input.platformFeeCents,
    creatorEarningsCents: input.creatorEarningsCents,
    creatorShareBps: input.creatorShareBps,
    currency: "USD",
    status: "pending",
    provider: input.provider,
    providerRef: input.providerRef ?? null,
    entitlementId: null,
    payoutStatus: "unpaid",
    paidOutAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  memoryTransactions.set(record.id, record);
  return cloneTx(record);
}

export async function getTransaction(id: string): Promise<TransactionRecord | null> {
  if (dbAvailable()) {
    const row = await prisma.transaction.findUnique({ where: { id } });
    return row ? txFromRow(row) : null;
  }
  const t = memoryTransactions.get(id);
  return t ? cloneTx(t) : null;
}

export async function getTransactionByProviderRef(
  provider: string,
  providerRef: string,
): Promise<TransactionRecord | null> {
  if (dbAvailable()) {
    const row = await prisma.transaction.findUnique({
      where: { provider_providerRef: { provider, providerRef } },
    });
    return row ? txFromRow(row) : null;
  }
  for (const t of memoryTransactions.values()) {
    if (t.provider === provider && t.providerRef === providerRef) return cloneTx(t);
  }
  return null;
}

/** Records the provider's reference after checkout creation. Returns null if the transaction is unknown. */
export async function setTransactionProviderRef(
  id: string,
  providerRef: string,
): Promise<TransactionRecord | null> {
  if (dbAvailable()) {
    try {
      const row = await prisma.transaction.update({ where: { id }, data: { providerRef } });
      return txFromRow(row);
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") return null;
      throw e;
    }
  }
  const t = memoryTransactions.get(id);
  if (!t) return null;
  t.providerRef = providerRef;
  t.updatedAt = new Date();
  return cloneTx(t);
}

/** Newest first. */
export async function listTransactions(filter: TransactionFilter = {}): Promise<TransactionRecord[]> {
  if (dbAvailable()) {
    const rows = await prisma.transaction.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.creatorId ? { creatorId: filter.creatorId } : {}),
        ...(filter.buyerId ? { buyerId: filter.buyerId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(txFromRow);
  }
  return [...memoryTransactions.values()]
    .filter(
      (t) =>
        (!filter.status || t.status === filter.status) &&
        (!filter.creatorId || t.creatorId === filter.creatorId) &&
        (!filter.buyerId || t.buyerId === filter.buyerId),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(cloneTx);
}

// ---- Entitlements ---------------------------------------------------------

/** Creates an `active` entitlement with the given term. */
export async function createEntitlement(input: CreateEntitlementInput): Promise<EntitlementRecord> {
  if (dbAvailable()) {
    const row = await prisma.entitlement.create({
      data: {
        userId: input.userId,
        scope: input.scope,
        creatorId: input.creatorId ?? null,
        mediaId: input.mediaId ?? null,
        type: input.type,
        status: "active",
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
    });
    return entFromRow(row);
  }
  const now = new Date();
  const record: EntitlementRecord = {
    id: randomUUID(),
    userId: input.userId,
    scope: input.scope,
    creatorId: input.creatorId ?? null,
    mediaId: input.mediaId ?? null,
    type: input.type,
    status: "active",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    createdAt: now,
    updatedAt: now,
  };
  memoryEntitlements.set(record.id, record);
  return cloneEnt(record);
}

/** All of a user's entitlements (any status), oldest first. */
export async function listEntitlementsForUser(userId: string): Promise<EntitlementRecord[]> {
  if (dbAvailable()) {
    const rows = await prisma.entitlement.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    return rows.map(entFromRow);
  }
  return [...memoryEntitlements.values()]
    .filter((e) => e.userId === userId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(cloneEnt);
}

// ---- Settlement (verified provider events) ---------------------------------

export type SettlementResult = "applied" | "duplicate" | "ignored" | "unknown_transaction";

/** A verified provider event, as recorded for de-duplication on `(provider, eventId)`. */
export type SettlementEvent = { provider: string; eventId: string; type: string; providerRef: string };

/**
 * The transition an event asks for. `from` is the status the transaction must still be in when the
 * change is written (a guarded conditional update), so concurrent deliveries cannot both apply it.
 */
export type SettlementPlan =
  | { to: "completed"; from: "pending" | "failed"; completedAt: Date; grant: CreateEntitlementInput | null }
  | { to: "failed"; from: "pending" }
  | { to: "refunded" | "chargeback"; from: "completed" };

/**
 * Decides the transition for the transaction as currently stored. `creatorGrants` are the buyer's
 * creator-scope grants for the transaction's creator (any status), for term stacking.
 * Returns null when the event asks for a transition the lifecycle does not allow.
 */
export type SettlementDecider = (
  tx: TransactionRecord,
  creatorGrants: readonly EntitlementRecord[],
) => SettlementPlan | null;

const eventKey = (provider: string, eventId: string) => JSON.stringify([provider, eventId]);

/** Marker thrown inside the Prisma transaction when the event row already exists. */
class DuplicatePaymentEvent extends Error {}

/**
 * Records the event, applies the decided status transition, and grants or revokes — as one unit.
 * Unknown `(provider, providerRef)`: nothing is recorded (a provider retry can still apply it).
 * Seen `(provider, eventId)`: "duplicate". Disallowed or already-made transition: "ignored", with the
 * event recorded as seen. Money columns are never touched.
 */
export async function settlePaymentEvent(
  event: SettlementEvent,
  decide: SettlementDecider,
): Promise<SettlementResult> {
  if (dbAvailable()) return settleWithPrisma(event, decide);

  // In-memory path: no awaits below, so the read-decide-write sequence cannot interleave.
  const stored = [...memoryTransactions.values()].find(
    (t) => t.provider === event.provider && t.providerRef === event.providerRef,
  );
  if (!stored) return "unknown_transaction";
  const key = eventKey(event.provider, event.eventId);
  if (memoryPaymentEvents.has(key)) return "duplicate";
  memoryPaymentEvents.add(key);

  const grants = [...memoryEntitlements.values()]
    .filter((e) => e.userId === stored.buyerId && e.scope === "creator" && e.creatorId === stored.creatorId)
    .map(cloneEnt);
  const plan = decide(cloneTx(stored), grants);
  if (!plan || stored.status !== plan.from) return "ignored";

  const now = new Date();
  if (plan.to === "completed") {
    stored.completedAt = plan.completedAt;
    if (plan.grant) {
      const ent: EntitlementRecord = {
        id: randomUUID(),
        userId: plan.grant.userId,
        scope: plan.grant.scope,
        creatorId: plan.grant.creatorId ?? null,
        mediaId: plan.grant.mediaId ?? null,
        type: plan.grant.type,
        status: "active",
        startsAt: plan.grant.startsAt,
        endsAt: plan.grant.endsAt,
        createdAt: now,
        updatedAt: now,
      };
      memoryEntitlements.set(ent.id, ent);
      stored.entitlementId = ent.id;
    }
  } else if (plan.from === "completed" && stored.entitlementId) {
    const ent = memoryEntitlements.get(stored.entitlementId);
    if (ent) {
      ent.status = "revoked";
      ent.updatedAt = now;
    }
  }
  stored.status = plan.to;
  stored.updatedAt = now;
  return "applied";
}

async function settleWithPrisma(event: SettlementEvent, decide: SettlementDecider): Promise<SettlementResult> {
  try {
    return await prisma.$transaction(async (db) => {
      const row = await db.transaction.findUnique({
        where: { provider_providerRef: { provider: event.provider, providerRef: event.providerRef } },
      });
      // Returning without writes commits nothing: a retry after the reference is stored can apply.
      if (!row) return "unknown_transaction" as const;

      try {
        await db.paymentEvent.create({
          data: { provider: event.provider, eventId: event.eventId, type: event.type, transactionId: row.id },
        });
      } catch (e) {
        // The failed INSERT aborts the Postgres transaction, so leave it by throwing (rolls back).
        if ((e as { code?: string }).code === "P2002") throw new DuplicatePaymentEvent();
        throw e;
      }

      const tx = txFromRow(row);
      const grants =
        tx.buyerId && tx.creatorId
          ? (
              await db.entitlement.findMany({
                where: { userId: tx.buyerId, scope: "creator", creatorId: tx.creatorId },
              })
            ).map(entFromRow)
          : [];
      const plan = decide(tx, grants);
      if (!plan) return "ignored" as const;

      // Guarded transition: only the delivery that still sees `from` wins; a concurrent one blocks on
      // the row lock, re-checks the WHERE and updates nothing. The event row stays (seen, ignored).
      const { count } = await db.transaction.updateMany({
        where: { id: tx.id, status: plan.from },
        data: { status: plan.to, ...(plan.to === "completed" ? { completedAt: plan.completedAt } : {}) },
      });
      if (count !== 1) return "ignored" as const;

      if (plan.to === "completed" && plan.grant) {
        const ent = await db.entitlement.create({
          data: {
            userId: plan.grant.userId,
            scope: plan.grant.scope,
            creatorId: plan.grant.creatorId ?? null,
            mediaId: plan.grant.mediaId ?? null,
            type: plan.grant.type,
            status: "active",
            startsAt: plan.grant.startsAt,
            endsAt: plan.grant.endsAt,
          },
        });
        await db.transaction.update({ where: { id: tx.id }, data: { entitlementId: ent.id } });
      } else if (plan.from === "completed" && tx.entitlementId) {
        await db.entitlement.updateMany({ where: { id: tx.entitlementId }, data: { status: "revoked" } });
      }
      return "applied" as const;
    });
  } catch (e) {
    if (e instanceof DuplicatePaymentEvent) return "duplicate";
    throw e;
  }
}
