import { prisma } from "@/lib/db";
import { MAX_UNLOCK_PRICE_CENTS } from "@/lib/media/config";
import type { AccessType } from "@/lib/payments/records";

/**
 * A creator's private-collection prices with dual backing (same pattern as src/lib/media/records.ts):
 * Prisma when DATABASE_URL is set, otherwise a process-local in-memory Map (dev/test only).
 * Prisma errors propagate. Each price is integer cents 1..MAX_UNLOCK_PRICE_CENTS, or null = not offered.
 */

export type CreatorPricing = {
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  oneTimePriceCents: number | null;
};

export type CollectionAccessType = Exclude<AccessType, "per_video">;

const PRICE_KEYS = ["monthlyPriceCents", "yearlyPriceCents", "oneTimePriceCents"] as const;

const PRICE_KEY_FOR: Record<CollectionAccessType, (typeof PRICE_KEYS)[number]> = {
  monthly: "monthlyPriceCents",
  yearly: "yearlyPriceCents",
  one_time: "oneTimePriceCents",
};

const notOffered = (): CreatorPricing => ({
  monthlyPriceCents: null,
  yearlyPriceCents: null,
  oneTimePriceCents: null,
});

const memoryPricing = new Map<string, CreatorPricing>();

/** Test helper: clears the in-memory store. */
export function resetMemoryPricing(): void {
  memoryPricing.clear();
}

function dbAvailable(): boolean {
  return typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0;
}

const isPrice = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_UNLOCK_PRICE_CENTS;

/** Missing or null keys mean "not offered"; unknown keys are dropped. */
export function validateCreatorPricing(
  input: unknown,
): { ok: true; value: CreatorPricing } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Pricing must be an object" };
  }
  const raw = input as Record<string, unknown>;
  const value = notOffered();
  for (const key of PRICE_KEYS) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (!isPrice(v)) {
      return {
        ok: false,
        error: `${key} must be empty or a whole number of cents between 1 and ${MAX_UNLOCK_PRICE_CENTS}`,
      };
    }
    value[key] = v;
  }
  return { ok: true, value };
}

/** The price for a collection access type, or null when that option is not offered. */
export function priceForAccessType(pricing: CreatorPricing, type: CollectionAccessType): number | null {
  return pricing[PRICE_KEY_FOR[type]];
}

/** All three prices are null when the creator has not set any. */
export async function getCreatorPricing(userId: string): Promise<CreatorPricing> {
  if (dbAvailable()) {
    const row = await prisma.creatorPricing.findUnique({ where: { userId } });
    if (!row) return notOffered();
    return {
      monthlyPriceCents: row.monthlyPriceCents,
      yearlyPriceCents: row.yearlyPriceCents,
      oneTimePriceCents: row.oneTimePriceCents,
    };
  }
  const stored = memoryPricing.get(userId);
  return stored ? { ...stored } : notOffered();
}

/** Replaces the creator's prices. Throws RangeError on invalid values. */
export async function setCreatorPricing(userId: string, pricing: CreatorPricing): Promise<CreatorPricing> {
  const v = validateCreatorPricing(pricing);
  if (!v.ok) throw new RangeError(v.error);
  if (dbAvailable()) {
    await prisma.creatorPricing.upsert({
      where: { userId },
      update: v.value,
      create: { userId, ...v.value },
    });
    return { ...v.value };
  }
  memoryPricing.set(userId, { ...v.value });
  return { ...v.value };
}
