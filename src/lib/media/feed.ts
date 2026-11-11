import { getPlaceholderSlides, type FeedItem } from "@/components/feed/feed-data";
import { prisma } from "@/lib/db";
import { listLiveByCategory, listLiveByOwner, type MediaRecord } from "@/lib/media/records";

export const assetUrl = (id: string, kind: "web" | "thumbnail") => `/api/media/${id}/asset/${kind}`;

/** Handles for owner ids; empty when no DB (or on failure) so callers fall back to a generic label. */
export async function resolveHandles(ownerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!process.env.DATABASE_URL || ownerIds.length === 0) return out;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(ownerIds)] } },
      select: { id: true, handle: true },
    });
    for (const u of users) out.set(u.id, u.handle);
  } catch {
    // degrade to generic creator labels
  }
  return out;
}

/** A record is playable only if it has a web asset; thumbnails are optional. */
export function toFeedItem(m: MediaRecord, handles: Map<string, string>): FeedItem | null {
  if (!m.assets.some((a) => a.kind === "web")) return null;
  const handle = handles.get(m.ownerId);
  return {
    id: m.id,
    title: m.title || "Untitled",
    creator: handle ? `@${handle}` : "Creator",
    poster: "",
    media: {
      type: m.type,
      src: assetUrl(m.id, "web"),
      posterSrc: m.assets.some((a) => a.kind === "thumbnail") ? assetUrl(m.id, "thumbnail") : null,
    },
  };
}

/** Real live+public media for the category; placeholders when there is none. */
export async function buildFeedItems(categorySlug: string): Promise<FeedItem[]> {
  const rows = await listLiveByCategory(categorySlug);
  const handles = await resolveHandles(rows.map((r) => r.ownerId));
  const items = rows.map((r) => toFeedItem(r, handles)).filter((i): i is FeedItem => i !== null);
  return items.length > 0 ? items : getPlaceholderSlides(categorySlug);
}

/** Live+public items for a profile grid. */
export async function listProfileMedia(ownerId: string): Promise<MediaRecord[]> {
  const rows = await listLiveByOwner(ownerId);
  return rows.filter((r) => r.assets.some((a) => a.kind === "web"));
}
