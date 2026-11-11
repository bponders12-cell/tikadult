import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_CREATOR_SHARE_BPS, isValidCreatorShareBps } from "@/lib/payments/split";

/**
 * Platform-wide settings with dual backing (same pattern as src/lib/media/records.ts):
 * Prisma when DATABASE_URL is set, otherwise a process-local in-memory Map (dev/test only).
 * Prisma errors propagate; they are never swallowed into memory.
 */

const CREATOR_SHARE_KEY = "creatorShareBps";

const memorySettings = new Map<string, unknown>();

/** Test helper: clears the in-memory store. */
export function resetMemoryPlatformSettings(): void {
  memorySettings.clear();
}

/** Test helper: writes an arbitrary (possibly invalid) raw value for the creator share. */
export function setMemoryCreatorShareRaw(value: unknown): void {
  memorySettings.set(CREATOR_SHARE_KEY, value);
}

function dbAvailable(): boolean {
  return typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0;
}

/** Creator share in basis points; the default when unset or the stored value is invalid. */
export async function getCreatorShareBps(): Promise<number> {
  let raw: unknown;
  if (dbAvailable()) {
    const row = await prisma.platformSetting.findUnique({ where: { key: CREATOR_SHARE_KEY } });
    raw = row?.value;
  } else {
    raw = memorySettings.get(CREATOR_SHARE_KEY);
  }
  return isValidCreatorShareBps(raw) ? raw : DEFAULT_CREATOR_SHARE_BPS;
}

/** Validates (integer, 7000..8000) and stores the creator share. Returns the stored value. */
export async function setCreatorShareBps(bps: number): Promise<number> {
  if (!isValidCreatorShareBps(bps)) {
    throw new RangeError("creatorShareBps must be an integer between 7000 and 8000");
  }
  if (dbAvailable()) {
    const value = bps as Prisma.InputJsonValue;
    await prisma.platformSetting.upsert({
      where: { key: CREATOR_SHARE_KEY },
      update: { value },
      create: { key: CREATOR_SHARE_KEY, value },
    });
    return bps;
  }
  memorySettings.set(CREATOR_SHARE_KEY, bps);
  return bps;
}
