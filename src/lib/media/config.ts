/** Maximum allowed video length, in seconds (5 minutes). */
export const MAX_VIDEO_DURATION_SEC = 5 * 60;

export type UploadMediaType = "video" | "image";

/** Upload allowlist: MIME type -> file extension, per media type. */
export const ALLOWED_FORMATS: Record<UploadMediaType, Record<string, string>> = {
  video: { "video/mp4": "mp4", "video/webm": "webm" },
  image: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
};

export const ACCEPT_ATTRIBUTE = Object.values(ALLOWED_FORMATS)
  .flatMap((m) => Object.keys(m))
  .join(",");

/** Default upload caps, overridable via MEDIA_MAX_VIDEO_BYTES / MEDIA_MAX_IMAGE_BYTES. */
export const DEFAULT_MAX_VIDEO_BYTES = 300 * 1024 * 1024;
export const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Title/caption length cap (characters). */
export const MAX_TITLE_LENGTH = 150;

/** Upper bound for a per-item unlock price: $10,000.00 in cents (well inside Int range). */
export const MAX_UNLOCK_PRICE_CENTS = 1_000_000;

type Env = Record<string, string | undefined>;

export function maxUploadBytes(type: UploadMediaType, env: Env = process.env): number {
  const raw = type === "video" ? env.MEDIA_MAX_VIDEO_BYTES : env.MEDIA_MAX_IMAGE_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return type === "video" ? DEFAULT_MAX_VIDEO_BYTES : DEFAULT_MAX_IMAGE_BYTES;
}

/** Resolves the media type for an allowlisted MIME type, or null if not allowed. */
export function mediaTypeForContentType(contentType: string): UploadMediaType | null {
  for (const type of ["video", "image"] as const) {
    if (Object.hasOwn(ALLOWED_FORMATS[type], contentType)) return type;
  }
  return null;
}

const GB = 1024 * 1024 * 1024;

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Quota defaults (overridable via env; see docs/ops/cost-and-deploy-notes.md). */
export const DEFAULT_MAX_ITEMS_PER_USER = 100;
export const DEFAULT_MAX_BYTES_PER_USER = 2 * GB;
export const DEFAULT_MAX_TOTAL_BYTES = 50 * GB;

export function quotaLimits(env: Env = process.env) {
  return {
    maxItemsPerUser: positiveInt(env.MEDIA_MAX_ITEMS_PER_USER, DEFAULT_MAX_ITEMS_PER_USER),
    maxBytesPerUser: positiveInt(env.MEDIA_MAX_BYTES_PER_USER, DEFAULT_MAX_BYTES_PER_USER),
    maxTotalBytes: positiveInt(env.MEDIA_MAX_TOTAL_BYTES, DEFAULT_MAX_TOTAL_BYTES),
  };
}

/** Lifecycle defaults: abandoned-draft TTL (hours) and removed-media byte retention (days). */
export const DEFAULT_DRAFT_TTL_HOURS = 24;
export const DEFAULT_REMOVED_RETENTION_DAYS = 30;

export function lifecycleWindows(env: Env = process.env) {
  return {
    draftTtlMs: positiveInt(env.MEDIA_DRAFT_TTL_HOURS, DEFAULT_DRAFT_TTL_HOURS) * 3600_000,
    removedRetentionMs: positiveInt(env.MEDIA_REMOVED_RETENTION_DAYS, DEFAULT_REMOVED_RETENTION_DAYS) * 86_400_000,
  };
}
