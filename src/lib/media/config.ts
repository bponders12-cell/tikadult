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
