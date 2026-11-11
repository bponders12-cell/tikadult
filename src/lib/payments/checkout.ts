import { getMedia } from "@/lib/media/records";
import { getCreatorShareBps } from "@/lib/platform-settings";
import { hasMediaAccess, isEntitlementValid } from "@/lib/payments/entitlements";
import { getCreatorPricing, priceForAccessType, type CollectionAccessType } from "@/lib/payments/pricing";
import {
  getPaymentProvider,
  PaymentsNotConfiguredError,
  type PaymentProvider,
} from "@/lib/payments/provider";
import {
  createTransaction,
  listEntitlementsForUser,
  setTransactionProviderRef,
  type AccessType,
} from "@/lib/payments/records";
import { computeSplit } from "@/lib/payments/split";

/**
 * Checkout use case: validates what is being bought, snapshots the split on a `pending` transaction,
 * then asks the provider for a hosted checkout. Granting happens only on a verified provider event.
 */

export const ACCESS_TYPES: readonly AccessType[] = ["monthly", "yearly", "one_time", "per_video"];

export const isAccessType = (v: unknown): v is AccessType =>
  typeof v === "string" && (ACCESS_TYPES as readonly string[]).includes(v);

export type CheckoutInput = {
  buyerId: string;
  accessType: AccessType;
  creatorId?: string | null;
  mediaId?: string | null;
  /** Absolute site origin used for the provider's return URLs. */
  origin: string;
};

/**
 * Why a purchase is refused when the buyer should be told something other than "not available":
 * they own the content, or they already have the access being sold.
 */
export type RefusalReason = "own_content" | "already_has_access";

export type CheckoutFailure = { ok: false; status: number; error: string; reason?: RefusalReason };

export type CheckoutResult = { ok: true; transactionId: string; redirectUrl: string } | CheckoutFailure;

export type CheckoutDeps = {
  getProvider?: () => PaymentProvider;
  now?: Date;
};

export type Purchase = { creatorId: string; mediaId: string | null; priceCents: number; description: string };

const fail = (status: number, error: string, reason?: RefusalReason): CheckoutFailure => ({
  ok: false,
  status,
  error,
  ...(reason ? { reason } : {}),
});

const COLLECTION_LABEL: Record<CollectionAccessType, string> = {
  monthly: "30-day access to a private collection",
  yearly: "365-day access to a private collection",
  one_time: "Permanent access to a private collection",
};

async function resolvePerVideo(
  buyerId: string,
  mediaId: string | null | undefined,
  now: Date,
): Promise<Purchase | CheckoutFailure> {
  if (!mediaId) return fail(400, "mediaId is required");
  const media = await getMedia(mediaId);
  if (!media || media.status !== "live" || media.visibility === "public") return fail(404, "Not found");
  if (!media.unlockPriceCents) return fail(400, "This item is not sold individually");
  if (media.ownerId === buyerId) return fail(400, "You cannot buy your own content", "own_content");
  if (await hasMediaAccess(buyerId, media, now)) {
    return fail(409, "You already have access to this item", "already_has_access");
  }
  return {
    creatorId: media.ownerId,
    mediaId: media.id,
    priceCents: media.unlockPriceCents,
    description: `Unlock: ${media.title || "private item"}`,
  };
}

async function resolveCollection(
  buyerId: string,
  accessType: CollectionAccessType,
  creatorId: string | null | undefined,
  now: Date,
): Promise<Purchase | CheckoutFailure> {
  if (!creatorId) return fail(400, "creatorId is required");
  const price = priceForAccessType(await getCreatorPricing(creatorId), accessType);
  if (price === null) return fail(400, "This access option is not offered");
  if (creatorId === buyerId) return fail(400, "You cannot buy your own content", "own_content");
  // A valid one-time grant is permanent access: no collection option (monthly, yearly or another
  // one-time) adds anything, so none may be charged. Timed grants do not block: terms stack.
  const grants = await listEntitlementsForUser(buyerId);
  const ownsForever = grants.some(
    (e) => e.scope === "creator" && e.creatorId === creatorId && e.type === "one_time" && isEntitlementValid(e, now),
  );
  if (ownsForever) return fail(409, "You already have permanent access to this collection", "already_has_access");
  return { creatorId, mediaId: null, priceCents: price, description: COLLECTION_LABEL[accessType] };
}

/**
 * What `buyerId` would be buying and for how much, or why they may not. The single eligibility check
 * shared by the checkout API (before charging) and the /checkout page (before showing a Pay button).
 */
export function resolvePurchase(
  input: Pick<CheckoutInput, "buyerId" | "accessType" | "creatorId" | "mediaId">,
  now: Date = new Date(),
): Promise<Purchase | CheckoutFailure> {
  return input.accessType === "per_video"
    ? resolvePerVideo(input.buyerId, input.mediaId, now)
    : resolveCollection(input.buyerId, input.accessType, input.creatorId, now);
}

export async function createCheckout(input: CheckoutInput, deps: CheckoutDeps = {}): Promise<CheckoutResult> {
  let provider: PaymentProvider;
  try {
    provider = (deps.getProvider ?? getPaymentProvider)();
  } catch (e) {
    if (e instanceof PaymentsNotConfiguredError) return fail(503, "Payments are not available yet");
    throw e;
  }
  const now = deps.now ?? new Date();

  const purchase = await resolvePurchase(input, now);
  if ("ok" in purchase) return purchase;

  const creatorShareBps = await getCreatorShareBps();
  const split = computeSplit(purchase.priceCents, creatorShareBps);
  const tx = await createTransaction({
    buyerId: input.buyerId,
    creatorId: purchase.creatorId,
    mediaId: purchase.mediaId,
    accessType: input.accessType,
    ...split,
    creatorShareBps,
    provider: provider.name,
  });

  const origin = input.origin.replace(/\/+$/, "");
  const result = `${origin}/checkout/result?tx=${encodeURIComponent(tx.id)}`;
  let session: { providerRef: string; redirectUrl: string };
  try {
    session = await provider.createCheckout({
      transactionId: tx.id,
      amountCents: split.grossCents,
      currency: "USD",
      description: purchase.description,
      successUrl: result,
      cancelUrl: `${result}&cancelled=1`,
    });
  } catch {
    // The pending transaction has no providerRef, so no provider event can ever complete it.
    return fail(502, "The payment provider could not start checkout. Please try again.");
  }
  await setTransactionProviderRef(tx.id, session.providerRef);
  return { ok: true, transactionId: tx.id, redirectUrl: session.redirectUrl };
}
