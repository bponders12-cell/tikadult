/**
 * Platform/creator revenue split. Pure integer-cent math; basis points (1/10000).
 * The split is snapshotted on each transaction at creation time and never recomputed.
 */

export const MIN_CREATOR_SHARE_BPS = 7000;
export const MAX_CREATOR_SHARE_BPS = 8000;
export const DEFAULT_CREATOR_SHARE_BPS = 8000;

export type Split = {
  grossCents: number;
  creatorEarningsCents: number;
  platformFeeCents: number;
};

export function isValidCreatorShareBps(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= MIN_CREATOR_SHARE_BPS &&
    v <= MAX_CREATOR_SHARE_BPS
  );
}

/** Creator gets floor(gross * share); the platform keeps the remainder, so the parts always sum to gross. */
export function computeSplit(grossCents: number, creatorShareBps: number): Split {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new RangeError("grossCents must be a non-negative integer");
  }
  if (!isValidCreatorShareBps(creatorShareBps)) {
    throw new RangeError(
      `creatorShareBps must be an integer between ${MIN_CREATOR_SHARE_BPS} and ${MAX_CREATOR_SHARE_BPS}`,
    );
  }
  const creatorEarningsCents = Math.floor((grossCents * creatorShareBps) / 10000);
  return { grossCents, creatorEarningsCents, platformFeeCents: grossCents - creatorEarningsCents };
}
