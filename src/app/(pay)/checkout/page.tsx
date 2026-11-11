import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { resolveHandles } from "@/lib/media/feed";
import { centsToDollars } from "@/lib/media/format";
import { getMedia } from "@/lib/media/records";
import { isAccessType, resolvePurchase, type RefusalReason } from "@/lib/payments/checkout";
import { getCreatorPricing, priceForAccessType } from "@/lib/payments/pricing";
import type { AccessType } from "@/lib/payments/records";
import CheckoutButton from "@/components/payments/CheckoutButton";
import "@/components/creator/creator.css";

export const instant = false;

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

type Offer = {
  accessType: AccessType;
  creatorId?: string;
  mediaId?: string;
  what: string;
  term: string;
  priceCents: number;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

async function creatorLabel(creatorId: string): Promise<string> {
  const handle = (await resolveHandles([creatorId])).get(creatorId);
  return handle ? `@${handle}` : "this creator";
}

const TERMS: Record<AccessType, string> = {
  monthly: "30 days of access. Does not renew automatically.",
  yearly: "365 days of access. Does not renew automatically.",
  one_time: "One-time payment, no expiry.",
  per_video: "One-time payment, no expiry.",
};

async function loadOffer(type: AccessType, creatorId?: string, mediaId?: string): Promise<Offer | null> {
  if (type === "per_video") {
    if (!mediaId) return null;
    const media = await getMedia(mediaId);
    if (!media || media.status !== "live" || media.visibility === "public" || !media.unlockPriceCents) return null;
    return {
      accessType: type,
      mediaId: media.id,
      what: `Unlock "${media.title || "Untitled"}" by ${await creatorLabel(media.ownerId)}`,
      term: TERMS[type],
      priceCents: media.unlockPriceCents,
    };
  }
  if (!creatorId) return null;
  const price = priceForAccessType(await getCreatorPricing(creatorId), type);
  if (price === null) return null;
  return {
    accessType: type,
    creatorId,
    what: `All private posts by ${await creatorLabel(creatorId)}`,
    term: TERMS[type],
    priceCents: price,
  };
}

export default async function CheckoutPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const type = first(params.type);
  const creatorId = first(params.creator);
  const mediaId = first(params.media);

  const session = await getSession();
  if (!session?.user?.id) {
    const query = new URLSearchParams();
    if (type) query.set("type", type);
    if (creatorId) query.set("creator", creatorId);
    if (mediaId) query.set("media", mediaId);
    redirect(`/login?next=${encodeURIComponent(`/checkout?${query}`)}`);
  }

  // Same eligibility check the checkout API runs before charging, so no Pay button is shown that
  // the API would refuse (own content, or access the viewer already has).
  let offer: Offer | null = null;
  let refusal: RefusalReason | undefined;
  if (isAccessType(type)) {
    const eligibility = await resolvePurchase({ buyerId: session.user.id, accessType: type, creatorId, mediaId });
    if ("ok" in eligibility) refusal = eligibility.reason;
    else offer = await loadOffer(type, creatorId, mediaId);
  }

  return (
    <main className="creator-shell">
      <div className="creator-inner">
        <nav className="creator-nav">
          <Link href="/">Browse</Link>
        </nav>
        <h1>Checkout</h1>
        {offer ? (
          <div className="creator-card">
            <p>{offer.what}</p>
            <p>
              <strong>${centsToDollars(offer.priceCents)} USD</strong>
            </p>
            <p className="creator-sub">{offer.term}</p>
            <CheckoutButton
              accessType={offer.accessType}
              creatorId={offer.creatorId}
              mediaId={offer.mediaId}
              label={`Pay $${centsToDollars(offer.priceCents)}`}
            />
          </div>
        ) : refusal === "own_content" ? (
          <p role="status">This is your own content, so there is nothing to buy.</p>
        ) : refusal === "already_has_access" ? (
          <p role="status">You already have access, so there is nothing to buy.</p>
        ) : (
          <p role="alert" className="creator-error">
            This purchase is not available.
          </p>
        )}
      </div>
    </main>
  );
}
