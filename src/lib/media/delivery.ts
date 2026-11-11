import type { MediaRecord } from "@/lib/media/records";

/** Asset kinds that may be delivered over HTTP. `original` is never served. */
export const DELIVERABLE_KINDS = ["web", "thumbnail"] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

export const isDeliverableKind = (k: string): k is DeliverableKind =>
  (DELIVERABLE_KINDS as readonly string[]).includes(k);

/** Public surfaces show only live + public media. */
export const isPubliclyVisible = (m: Pick<MediaRecord, "status" | "visibility">): boolean =>
  m.status === "live" && m.visibility === "public";

/** Anonymous/other callers: public+live only. Owners: their own items in any state. */
export const canFetchAsset = (m: MediaRecord, userId: string | null): boolean =>
  isPubliclyVisible(m) || (userId !== null && m.ownerId === userId);

export type RangeResult =
  | { kind: "none" }
  | { kind: "range"; start: number; end: number }
  | { kind: "unsatisfiable" };

/**
 * Parses a single `bytes=` range against a body of `size` bytes.
 * Absent, malformed, non-bytes and multi-range headers yield "none" (serve the
 * full 200 body, which RFC 9110 permits). Unsatisfiable ranges yield 416.
 */
export function parseRange(header: string | null, size: number): RangeResult {
  if (!header) return { kind: "none" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return { kind: "none" };
  if (size === 0) return { kind: "unsatisfiable" };
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return { kind: "unsatisfiable" };
    return { kind: "range", start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || start > end) return { kind: "unsatisfiable" };
  return { kind: "range", start, end };
}
