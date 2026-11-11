import { assetUrl } from "@/lib/media/feed";
import { listLiveNonPublicByOwner, type MediaRecord, type MediaType } from "@/lib/media/records";
import { hasValidEntitlementFor, isEntitlementValid } from "@/lib/payments/entitlements";
import {
  getCreatorPricing,
  priceForAccessType,
  type CollectionAccessType,
  type CreatorPricing,
} from "@/lib/payments/pricing";
import { listEntitlementsForUser, type EntitlementRecord } from "@/lib/payments/records";

/**
 * View model for a profile's "Private collection" section. Locked tiles carry no asset URL at all,
 * so the page cannot leak a thumbnail of content the viewer has not paid for.
 */

export type UnlockedTile = {
  kind: "unlocked";
  id: string;
  title: string;
  type: MediaType;
  webSrc: string;
  thumbnailSrc: string | null;
};
export type LockedTile = {
  kind: "locked";
  id: string;
  title: string;
  /** Per-video price; null when the item is not individually purchasable. */
  priceCents: number | null;
  checkoutHref: string | null;
};
export type PrivateTile = UnlockedTile | LockedTile;
export type CollectionOffer = { type: CollectionAccessType; priceCents: number; href: string };
export type PrivateCollectionView = {
  tiles: PrivateTile[];
  /** Collection purchase options; empty for the owner and for a holder of a valid one-time grant. */
  offers: CollectionOffer[];
  /** End of the viewer's timed access (stacked terms included) while a timed grant is valid. */
  accessUntil: Date | null;
};
export type ProfileViewer = { id: string | null; isOwner: boolean };

const COLLECTION_TYPES: readonly CollectionAccessType[] = ["monthly", "yearly", "one_time"];

function tile(m: MediaRecord, unlocked: boolean): PrivateTile {
  const title = m.title || "Untitled";
  if (unlocked) {
    return {
      kind: "unlocked",
      id: m.id,
      title,
      type: m.type,
      webSrc: assetUrl(m.id, "web"),
      thumbnailSrc: m.assets.some((a) => a.kind === "thumbnail") ? assetUrl(m.id, "thumbnail") : null,
    };
  }
  const price = m.unlockPriceCents && m.unlockPriceCents > 0 ? m.unlockPriceCents : null;
  return {
    kind: "locked",
    id: m.id,
    title,
    priceCents: price,
    checkoutHref: price ? `/checkout?type=per_video&media=${encodeURIComponent(m.id)}` : null,
  };
}

/** Pure part: decides tiles, offers and access end from already-loaded data. */
export function buildPrivateCollectionView(input: {
  creatorId: string;
  viewer: ProfileViewer;
  items: readonly MediaRecord[];
  pricing: CreatorPricing;
  entitlements: readonly EntitlementRecord[];
  now: Date;
}): PrivateCollectionView {
  const { creatorId, viewer, pricing, now } = input;
  const grants = viewer.isOwner ? [] : input.entitlements.filter((e) => e.userId === viewer.id);
  const tiles = input.items
    .filter((m) => m.assets.some((a) => a.kind === "web"))
    .map((m) => tile(m, viewer.isOwner || hasValidEntitlementFor(grants, m, now)));

  const creatorGrants = grants.filter((e) => e.scope === "creator" && e.creatorId === creatorId);
  const ownsForever = creatorGrants.some((e) => e.type === "one_time" && isEntitlementValid(e, now));
  const offers: CollectionOffer[] =
    viewer.isOwner || ownsForever
      ? []
      : COLLECTION_TYPES.flatMap((type) => {
          const priceCents = priceForAccessType(pricing, type);
          return priceCents === null
            ? []
            : [{ type, priceCents, href: `/checkout?type=${type}&creator=${encodeURIComponent(creatorId)}` }];
        });

  const timed = creatorGrants.filter((e) => e.status === "active" && e.endsAt !== null);
  const accessUntil = timed.some((e) => isEntitlementValid(e, now))
    ? new Date(Math.max(...timed.map((e) => e.endsAt!.getTime())))
    : null;

  return { tiles, offers, accessUntil };
}

/** Loads the creator's private items, prices and the viewer's grants, then builds the view. */
export async function loadPrivateCollectionView(
  creatorId: string,
  viewer: ProfileViewer,
  now: Date = new Date(),
): Promise<PrivateCollectionView> {
  const [items, pricing, entitlements] = await Promise.all([
    listLiveNonPublicByOwner(creatorId),
    getCreatorPricing(creatorId),
    viewer.id && !viewer.isOwner ? listEntitlementsForUser(viewer.id) : Promise.resolve([]),
  ]);
  return buildPrivateCollectionView({ creatorId, viewer, items, pricing, entitlements, now });
}
