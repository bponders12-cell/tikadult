import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Media record helpers with dual backing (same pattern as src/lib/settings.ts):
 * Prisma when DATABASE_URL is set, otherwise a process-local in-memory Map
 * (not durable; dev/test only). Unlike settings, a Prisma error is NOT silently
 * swallowed into memory: that would split records across two stores.
 *
 * Records expose `categorySlug` (the stable public identifier) rather than the
 * DB `categoryId`.
 */

export type MediaType = "video" | "image";
export type MediaVisibility = "public" | "private" | "restricted";
export type MediaStatus = "draft" | "processing" | "live" | "flagged" | "removed";
export type ProcessingStatus = "pending" | "processing" | "ready" | "failed";
export type MediaAssetKind = "original" | "web" | "thumbnail";

export type MediaAssetRecord = {
  kind: MediaAssetKind;
  storageKey: string;
  contentType: string;
  sizeBytes: number | null;
};

export type MediaRecord = {
  id: string;
  ownerId: string;
  categorySlug: string | null;
  title: string | null;
  type: MediaType;
  visibility: MediaVisibility;
  /** null = free */
  unlockPriceCents: number | null;
  status: MediaStatus;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  flagReason: string | null;
  flaggedAt: Date | null;
  publishedAt: Date | null;
  durationSec: number | null;
  sizeBytes: number | null;
  format: string | null;
  createdAt: Date;
  updatedAt: Date;
  assets: MediaAssetRecord[];
};

export type CreateMediaInput = {
  ownerId: string;
  type: MediaType;
  visibility: MediaVisibility;
  unlockPriceCents?: number | null;
  title?: string | null;
  categorySlug?: string | null;
  durationSec?: number | null;
  sizeBytes?: number | null;
  format?: string | null;
};

export type UpdateMediaPatch = Partial<
  Pick<
    MediaRecord,
    | "title"
    | "categorySlug"
    | "visibility"
    | "unlockPriceCents"
    | "status"
    | "processingStatus"
    | "processingError"
    | "flagReason"
    | "flaggedAt"
    | "publishedAt"
    | "durationSec"
    | "sizeBytes"
    | "format"
  >
>;

const memoryMedia = new Map<string, MediaRecord>();

/** Test helper: clears the in-memory store. */
export function resetMemoryMedia(): void {
  memoryMedia.clear();
}

function dbAvailable(): boolean {
  return typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0;
}

const clone = (m: MediaRecord): MediaRecord => ({
  ...m,
  assets: m.assets.map((a) => ({ ...a })),
});

// ---- Prisma mapping -------------------------------------------------------

type PrismaMediaRow = Awaited<ReturnType<typeof findRow>>;

const include = { category: { select: { slug: true } }, assets: true } as const;

function findRow(id: string) {
  return prisma.media.findUnique({ where: { id }, include });
}

function fromRow(row: NonNullable<PrismaMediaRow>): MediaRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    categorySlug: row.category?.slug ?? null,
    title: row.title,
    type: row.type as MediaType,
    visibility: row.visibility as MediaVisibility,
    unlockPriceCents: row.unlockPriceCents,
    status: row.status as MediaStatus,
    processingStatus: row.processingStatus as ProcessingStatus,
    processingError: row.processingError,
    flagReason: row.flagReason,
    flaggedAt: row.flaggedAt,
    publishedAt: row.publishedAt,
    durationSec: row.durationSec,
    sizeBytes: row.sizeBytes,
    format: row.format,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    assets: row.assets.map((a) => ({
      kind: a.kind as MediaAssetKind,
      storageKey: a.storageKey,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
    })),
  };
}

export class UnknownCategoryError extends Error {
  constructor(slug: string) {
    super(`Category "${slug}" is not present in the database`);
    this.name = "UnknownCategoryError";
  }
}

/** undefined = leave alone, null = clear, string = link to that category (throws if absent from the DB). */
async function resolveCategoryId(slug: string | null | undefined): Promise<string | null | undefined> {
  if (slug === undefined) return undefined;
  if (slug === null) return null;
  const cat = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  if (!cat) throw new UnknownCategoryError(slug);
  return cat.id;
}

// ---- Public API -----------------------------------------------------------

export async function createMedia(input: CreateMediaInput): Promise<MediaRecord> {
  if (dbAvailable()) {
    const row = await prisma.media.create({
      data: {
        ownerId: input.ownerId,
        type: input.type,
        visibility: input.visibility,
        unlockPriceCents: input.unlockPriceCents ?? null,
        title: input.title ?? null,
        categoryId: (await resolveCategoryId(input.categorySlug)) ?? null,
        durationSec: input.durationSec ?? null,
        sizeBytes: input.sizeBytes ?? null,
        format: input.format ?? null,
        status: "draft",
        processingStatus: "pending",
      },
      include,
    });
    return fromRow(row);
  }
  const now = new Date();
  const record: MediaRecord = {
    id: randomUUID(),
    ownerId: input.ownerId,
    categorySlug: input.categorySlug ?? null,
    title: input.title ?? null,
    type: input.type,
    visibility: input.visibility,
    unlockPriceCents: input.unlockPriceCents ?? null,
    status: "draft",
    processingStatus: "pending",
    processingError: null,
    flagReason: null,
    flaggedAt: null,
    publishedAt: null,
    durationSec: input.durationSec ?? null,
    sizeBytes: input.sizeBytes ?? null,
    format: input.format ?? null,
    createdAt: now,
    updatedAt: now,
    assets: [],
  };
  memoryMedia.set(record.id, record);
  return clone(record);
}

export async function getMedia(id: string): Promise<MediaRecord | null> {
  if (dbAvailable()) {
    const row = await findRow(id);
    return row ? fromRow(row) : null;
  }
  const m = memoryMedia.get(id);
  return m ? clone(m) : null;
}

/** Newest first. */
export async function listMediaByOwner(ownerId: string): Promise<MediaRecord[]> {
  if (dbAvailable()) {
    const rows = await prisma.media.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      include,
    });
    return rows.map(fromRow);
  }
  return [...memoryMedia.values()]
    .filter((m) => m.ownerId === ownerId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(clone);
}

const LIVE_PUBLIC = { status: "live", visibility: "public" } as const;
const isLivePublic = (m: MediaRecord) => m.status === "live" && m.visibility === "public";
const newestPublished = (a: MediaRecord, b: MediaRecord) =>
  (b.publishedAt ?? b.createdAt).getTime() - (a.publishedAt ?? a.createdAt).getTime();

/** Live + public items in a category, newest published first. */
export async function listLiveByCategory(categorySlug: string, limit = 50): Promise<MediaRecord[]> {
  if (dbAvailable()) {
    const rows = await prisma.media.findMany({
      where: { ...LIVE_PUBLIC, category: { slug: categorySlug } },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      include,
    });
    return rows.map(fromRow);
  }
  return [...memoryMedia.values()]
    .filter((m) => isLivePublic(m) && m.categorySlug === categorySlug)
    .sort(newestPublished)
    .slice(0, limit)
    .map(clone);
}

/** Live + public items by owner, newest published first. */
export async function listLiveByOwner(ownerId: string, limit = 50): Promise<MediaRecord[]> {
  if (dbAvailable()) {
    const rows = await prisma.media.findMany({
      where: { ...LIVE_PUBLIC, ownerId },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      include,
    });
    return rows.map(fromRow);
  }
  return [...memoryMedia.values()]
    .filter((m) => isLivePublic(m) && m.ownerId === ownerId)
    .sort(newestPublished)
    .slice(0, limit)
    .map(clone);
}

/** Records awaiting processing (status=processing, processingStatus=pending), oldest first. */
export async function listPendingMedia(): Promise<MediaRecord[]> {
  if (dbAvailable()) {
    const rows = await prisma.media.findMany({
      where: { status: "processing", processingStatus: "pending" },
      orderBy: { createdAt: "asc" },
      include,
    });
    return rows.map(fromRow);
  }
  return [...memoryMedia.values()]
    .filter((m) => m.status === "processing" && m.processingStatus === "pending")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(clone);
}

export async function updateMedia(id: string, patch: UpdateMediaPatch): Promise<MediaRecord | null> {
  if (dbAvailable()) {
    const { categorySlug, ...rest } = patch;
    const categoryId = await resolveCategoryId(categorySlug);
    const data: Prisma.MediaUncheckedUpdateInput = { ...rest };
    if (categoryId !== undefined) data.categoryId = categoryId;
    try {
      const row = await prisma.media.update({
        where: { id },
        data,
        include,
      });
      return fromRow(row);
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") return null;
      throw e;
    }
  }
  const current = memoryMedia.get(id);
  if (!current) return null;
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next: MediaRecord = { ...current, ...defined, updatedAt: new Date() };
  memoryMedia.set(id, next);
  return clone(next);
}

/** Upserts the asset for (mediaId, kind). Returns false if the media does not exist. */
export async function setMediaAsset(mediaId: string, asset: MediaAssetRecord): Promise<boolean> {
  if (dbAvailable()) {
    try {
      await prisma.mediaAsset.upsert({
        where: { mediaId_kind: { mediaId, kind: asset.kind } },
        update: {
          storageKey: asset.storageKey,
          contentType: asset.contentType,
          sizeBytes: asset.sizeBytes,
        },
        create: { mediaId, ...asset },
      });
      return true;
    } catch (e) {
      if ((e as { code?: string }).code === "P2003") return false;
      throw e;
    }
  }
  const current = memoryMedia.get(mediaId);
  if (!current) return false;
  current.assets = [...current.assets.filter((a) => a.kind !== asset.kind), { ...asset }];
  current.updatedAt = new Date();
  return true;
}

/** Deletes the record (and its assets rows). Callers remove stored bytes. */
export async function deleteMedia(id: string): Promise<boolean> {
  if (dbAvailable()) {
    try {
      await prisma.media.delete({ where: { id } });
      return true;
    } catch (e) {
      if ((e as { code?: string }).code === "P2025") return false;
      throw e;
    }
  }
  return memoryMedia.delete(id);
}
