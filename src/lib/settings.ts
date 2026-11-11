import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type FeedLayout = "immersive" | "side";

export type PrivacyPrefs = {
  profileVisibility?: "public" | "private" | "friends";
  allowMessagesFrom?: "everyone" | "friends" | "no_one";
  showActivity?: boolean;
  [key: string]: unknown;
};

export type MessagingPrefs = {
  readReceipts?: boolean;
  typingIndicators?: boolean;
  allowMedia?: boolean;
  [key: string]: unknown;
};

export type UserSettingsRecord = {
  userId?: string;
  feedLayout: FeedLayout;
  privacyPrefs: PrivacyPrefs;
  messagingPrefs: MessagingPrefs;
};

export type UserSettingsPatch = Partial<{
  feedLayout: FeedLayout;
  privacyPrefs: PrivacyPrefs;
  messagingPrefs: MessagingPrefs;
}>;

const DEFAULT_PRIVACY_PREFS: PrivacyPrefs = {
  profileVisibility: "public",
  allowMessagesFrom: "everyone",
  showActivity: true,
};

const DEFAULT_MESSAGING_PREFS: MessagingPrefs = {
  readReceipts: true,
  typingIndicators: true,
  allowMedia: true,
};

// Simple in-memory fallback so behavior remains usable when DB is unavailable.
// Keyed by userId; not durable across process restarts.
// Anchored on globalThis (the same pattern as the Prisma client in src/lib/db.ts): Next.js can
// instantiate this module separately for route handlers and pages, and a plain module-level store
// would then be split so that a write from one is invisible to the other.
const globalForUserSettings = globalThis as unknown as { __memoryUserSettings?: Map<string, UserSettingsRecord> };
const memorySettings = (globalForUserSettings.__memoryUserSettings ??= new Map<string, UserSettingsRecord>());

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceFeedLayout(value: unknown): FeedLayout {
  return value === "side" ? "side" : "immersive";
}

export function defaultSettings(): UserSettingsRecord {
  return {
    feedLayout: "immersive",
    privacyPrefs: { ...DEFAULT_PRIVACY_PREFS },
    messagingPrefs: { ...DEFAULT_MESSAGING_PREFS },
  };
}

export function resolveFeedLayout(layout: unknown): FeedLayout {
  return coerceFeedLayout(layout);
}

export function normalizePrivacyPrefs(value: unknown): PrivacyPrefs {
  const base = { ...DEFAULT_PRIVACY_PREFS };
  if (!isPlainObject(value)) return base;
  return { ...base, ...value } as PrivacyPrefs;
}

export function normalizeMessagingPrefs(value: unknown): MessagingPrefs {
  const base = { ...DEFAULT_MESSAGING_PREFS };
  if (!isPlainObject(value)) return base;
  return { ...base, ...value } as MessagingPrefs;
}

export function normalizeSettings(
  input:
    | {
        userId?: string;
        feedLayout?: unknown;
        privacyPrefs?: unknown;
        messagingPrefs?: unknown;
      }
    | null
    | undefined,
): UserSettingsRecord {
  const d = defaultSettings();
  return {
    userId: input?.userId,
    feedLayout: coerceFeedLayout(input?.feedLayout ?? d.feedLayout),
    privacyPrefs: normalizePrivacyPrefs(input?.privacyPrefs),
    messagingPrefs: normalizeMessagingPrefs(input?.messagingPrefs),
  };
}

export function mergeSettings(
  current: UserSettingsRecord,
  patch: UserSettingsPatch,
): UserSettingsRecord {
  const nextPrivacy = patch.privacyPrefs
    ? normalizePrivacyPrefs({ ...current.privacyPrefs, ...patch.privacyPrefs })
    : normalizePrivacyPrefs(current.privacyPrefs);
  const nextMessaging = patch.messagingPrefs
    ? normalizeMessagingPrefs({ ...current.messagingPrefs, ...patch.messagingPrefs })
    : normalizeMessagingPrefs(current.messagingPrefs);
  return {
    ...current,
    feedLayout: coerceFeedLayout(patch.feedLayout ?? current.feedLayout),
    privacyPrefs: nextPrivacy,
    messagingPrefs: nextMessaging,
  };
}

function dbAvailable(): boolean {
  return typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0;
}

export async function getUserSettings(userId: string): Promise<UserSettingsRecord> {
  if (!userId) return defaultSettings();
  if (dbAvailable()) {
    try {
      const row = await prisma.userSettings.findUnique({ where: { userId } });
      if (row) {
        const normalized = normalizeSettings({
          userId,
          feedLayout: row.feedLayout as FeedLayout,
          privacyPrefs: row.privacyPrefs as unknown,
          messagingPrefs: row.messagingPrefs as unknown,
        });
        memorySettings.set(userId, normalized);
        return normalized;
      }
      // create defaults if missing
      try {
        const created = await prisma.userSettings.create({
          data: {
            userId,
            feedLayout: "immersive",
            privacyPrefs: DEFAULT_PRIVACY_PREFS as unknown as Prisma.InputJsonValue,
            messagingPrefs: DEFAULT_MESSAGING_PREFS as unknown as Prisma.InputJsonValue,
          },
        });
        const normalized = normalizeSettings({
          userId,
          feedLayout: created.feedLayout as FeedLayout,
          privacyPrefs: created.privacyPrefs as unknown,
          messagingPrefs: created.messagingPrefs as unknown,
        });
        memorySettings.set(userId, normalized);
        return normalized;
      } catch {
        // fall through to memory/defaults
      }
    } catch {
      // fall through to memory/defaults
    }
  }
  return memorySettings.get(userId) ?? { ...defaultSettings(), userId };
}

export async function updateUserSettings(
  userId: string,
  patchOrActor: UserSettingsPatch | string,
  maybePatch?: UserSettingsPatch,
): Promise<UserSettingsRecord> {
  // Enforce user-owned updates. Supports (userId, patch) for self-updates
  // and (userId, actorUserId, patch) for explicit ownership checks.
  const actorUserId = typeof patchOrActor === "string" ? patchOrActor : userId;
  const patch = (typeof patchOrActor === "string" ? maybePatch : patchOrActor) ?? {};
  if (!userId || !actorUserId || userId !== actorUserId) {
    throw new Error("FORBIDDEN");
  }

  const current = await getUserSettings(userId);
  const next = mergeSettings(current, patch);
  next.userId = userId;
  memorySettings.set(userId, next);

  if (dbAvailable()) {
    try {
      const saved = await prisma.userSettings.upsert({
        where: { userId },
        update: {
          feedLayout: next.feedLayout,
          privacyPrefs: next.privacyPrefs as unknown as Prisma.InputJsonValue,
          messagingPrefs: next.messagingPrefs as unknown as Prisma.InputJsonValue,
        },
        create: {
          userId,
          feedLayout: next.feedLayout,
          privacyPrefs: next.privacyPrefs as unknown as Prisma.InputJsonValue,
          messagingPrefs: next.messagingPrefs as unknown as Prisma.InputJsonValue,
        },
      });
      return normalizeSettings({
        userId,
        feedLayout: saved.feedLayout as FeedLayout,
        privacyPrefs: saved.privacyPrefs as unknown,
        messagingPrefs: saved.messagingPrefs as unknown,
      });
    } catch {
      // degrade gracefully: return in-memory updated settings
    }
  }

  return next;
}
