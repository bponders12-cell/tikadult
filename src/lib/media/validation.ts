import { getDefaultCategories } from "@/lib/categories";
import {
  MAX_TITLE_LENGTH,
  MAX_UNLOCK_PRICE_CENTS,
  maxUploadBytes,
  mediaTypeForContentType,
  type UploadMediaType,
} from "@/lib/media/config";

export const VISIBILITIES = ["public", "private", "restricted"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: 400 | 413 | 415 };

export type InitInput = {
  type: UploadMediaType;
  contentType: string;
  sizeBytes: number;
  title: string | null;
  categorySlug: string | null;
  visibility: Visibility;
  unlockPriceCents: number | null;
  durationSec: number | null;
};

export type UpdateInput = Partial<{
  title: string | null;
  categorySlug: string | null;
  visibility: Visibility;
  unlockPriceCents: number | null;
}>;

type Env = Record<string, string | undefined>;

const fail = (error: string, status: 400 | 413 | 415 = 400) =>
  ({ ok: false, error, status }) as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseTitle(v: unknown): ValidationResult<string | null> {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return fail("title must be a string");
  const t = v.trim();
  if (t.length > MAX_TITLE_LENGTH) return fail(`title must be at most ${MAX_TITLE_LENGTH} characters`);
  return { ok: true, value: t || null };
}

function parseCategory(v: unknown): ValidationResult<string | null> {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string") return fail("categorySlug must be a string");
  if (!getDefaultCategories().some((c) => c.slug === v)) return fail("unknown category");
  return { ok: true, value: v };
}

function parseVisibility(v: unknown): ValidationResult<Visibility> {
  if (typeof v !== "string" || !(VISIBILITIES as readonly string[]).includes(v)) {
    return fail("visibility must be one of: public, private, restricted");
  }
  return { ok: true, value: v as Visibility };
}

/** null/undefined = free. Otherwise a non-negative integer number of cents. */
function parsePrice(v: unknown): ValidationResult<number | null> {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    return fail("unlockPriceCents must be a non-negative integer");
  }
  if (v > MAX_UNLOCK_PRICE_CENTS) return fail("unlockPriceCents is too large");
  return { ok: true, value: v };
}

export function validateInit(body: unknown, env: Env = process.env): ValidationResult<InitInput> {
  if (!isObject(body)) return fail("Body must be a JSON object");

  const contentType = typeof body.contentType === "string" ? body.contentType.toLowerCase() : "";
  const type = mediaTypeForContentType(contentType);
  if (!type) return fail("Unsupported file format", 415);
  if (body.type !== undefined && body.type !== type) return fail("type does not match contentType");

  const size = body.sizeBytes;
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
    return fail("sizeBytes must be a positive integer");
  }
  const cap = maxUploadBytes(type, env);
  if (size > cap) return fail(`File exceeds the ${cap} byte limit for ${type}s`, 413);

  const visibility = parseVisibility(body.visibility);
  if (!visibility.ok) return visibility;
  const price = parsePrice(body.unlockPriceCents);
  if (!price.ok) return price;
  if (visibility.value === "public" && price.value !== null) {
    return fail("Public items are free; unlockPriceCents is only allowed for private or restricted");
  }
  const title = parseTitle(body.title);
  if (!title.ok) return title;
  const category = parseCategory(body.categorySlug);
  if (!category.ok) return category;

  let durationSec: number | null = null;
  if (body.durationSec !== undefined && body.durationSec !== null) {
    const d = body.durationSec;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0) {
      return fail("durationSec must be a non-negative integer");
    }
    durationSec = type === "video" ? d : null;
  }

  return {
    ok: true,
    value: {
      type,
      contentType,
      sizeBytes: size,
      title: title.value,
      categorySlug: category.value,
      visibility: visibility.value,
      unlockPriceCents: price.value,
      durationSec,
    },
  };
}

/**
 * Validates a PATCH. Only title/categorySlug/visibility/unlockPriceCents are
 * accepted; everything else (status, owner, ...) is ignored. Pricing rules are
 * checked against the resulting state: switching to public clears the price.
 */
export function validateUpdate(
  body: unknown,
  current: { visibility: string; unlockPriceCents: number | null },
): ValidationResult<UpdateInput> {
  if (!isObject(body)) return fail("Body must be a JSON object");
  const out: UpdateInput = {};

  if ("title" in body) {
    const r = parseTitle(body.title);
    if (!r.ok) return r;
    out.title = r.value;
  }
  if ("categorySlug" in body) {
    const r = parseCategory(body.categorySlug);
    if (!r.ok) return r;
    out.categorySlug = r.value;
  }
  if ("visibility" in body) {
    const r = parseVisibility(body.visibility);
    if (!r.ok) return r;
    out.visibility = r.value;
  }
  const priceGiven = "unlockPriceCents" in body;
  if (priceGiven) {
    const r = parsePrice(body.unlockPriceCents);
    if (!r.ok) return r;
    out.unlockPriceCents = r.value;
  }

  if (Object.keys(out).length === 0) return fail("No updatable fields provided");

  const nextVisibility = out.visibility ?? current.visibility;
  if (nextVisibility === "public") {
    if (priceGiven && out.unlockPriceCents !== null) {
      return fail("Public items are free; unlockPriceCents is only allowed for private or restricted");
    }
    if (current.unlockPriceCents !== null || priceGiven) out.unlockPriceCents = null;
  }
  return { ok: true, value: out };
}
