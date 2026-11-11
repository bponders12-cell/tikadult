import type { MediaRecord } from "@/lib/media/records";
import { listEntitlementsForUser, type AccessType, type EntitlementRecord } from "@/lib/payments/records";

/**
 * Grant validity and term logic. Expiry is evaluated at read time; there is no sweeper job.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const TERM_DAYS: Partial<Record<AccessType, number>> = { monthly: 30, yearly: 365 };

export type MediaTarget = Pick<MediaRecord, "id" | "ownerId">;

/** Valid iff active, started, and not yet ended (endsAt is exclusive; null = never expires). */
export function isEntitlementValid(
  e: Pick<EntitlementRecord, "status" | "startsAt" | "endsAt">,
  now: Date,
): boolean {
  if (e.status !== "active") return false;
  if (e.startsAt.getTime() > now.getTime()) return false;
  return e.endsAt === null || now.getTime() < e.endsAt.getTime();
}

/** Scope match only (not validity): creator scope covers the owner's media, media scope covers one id. */
export function entitlementCoversMedia(
  e: Pick<EntitlementRecord, "scope" | "creatorId" | "mediaId">,
  media: MediaTarget,
): boolean {
  if (e.scope === "media") return e.mediaId !== null && e.mediaId === media.id;
  return e.creatorId !== null && e.creatorId === media.ownerId;
}

export function hasValidEntitlementFor(
  entitlements: readonly EntitlementRecord[],
  media: MediaTarget,
  now: Date,
): boolean {
  return entitlements.some((e) => isEntitlementValid(e, now) && entitlementCoversMedia(e, media));
}

/**
 * Term for a new grant. monthly = 30 days, yearly = 365 days; one_time / per_video never expire.
 * Timed terms stack: a new monthly/yearly starts at the latest `endsAt` among `existing` creator-scope,
 * active, timed grants that have not yet ended (currently valid or future), else at `now`.
 * `existing` should be the buyer's grants for the same creator; non-qualifying entries are ignored.
 */
export function computeTerm(
  type: AccessType,
  now: Date,
  existing: readonly EntitlementRecord[],
): { startsAt: Date; endsAt: Date | null } {
  const days = TERM_DAYS[type];
  if (days === undefined) return { startsAt: now, endsAt: null };
  let start = now.getTime();
  for (const e of existing) {
    if (e.scope !== "creator" || e.status !== "active" || e.endsAt === null) continue;
    if (e.endsAt.getTime() > start) start = e.endsAt.getTime();
  }
  return { startsAt: new Date(start), endsAt: new Date(start + days * DAY_MS) };
}

/**
 * Entitlement part of the access rule only: the media must be live and the user must hold a valid
 * matching grant. False for anonymous viewers. Public/owner checks live with the caller.
 */
export async function hasMediaAccess(
  userId: string | null,
  media: MediaRecord,
  now: Date = new Date(),
): Promise<boolean> {
  if (!userId) return false;
  if (media.status !== "live") return false;
  const entitlements = await listEntitlementsForUser(userId);
  return hasValidEntitlementFor(entitlements, media, now);
}
