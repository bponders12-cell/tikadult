import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND_TEST");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT_TEST ${url}`);
  },
}));

import CheckoutPage from "@/app/(pay)/checkout/page";
import CheckoutButton from "@/components/payments/CheckoutButton";
import { createMedia, resetMemoryMedia, updateMedia } from "@/lib/media/records";
import { resetMemoryPricing, setCreatorPricing } from "@/lib/payments/pricing";
import { createEntitlement, resetMemoryPayments, type AccessType } from "@/lib/payments/records";
import { resetMemoryPlatformSettings } from "@/lib/platform-settings";

const DAY = 24 * 60 * 60 * 1000;

const as = (id: string) => getSession.mockResolvedValue({ user: { id, role: "viewer" } });

/** Walks the page's returned element tree (no rendering): every element and all text. */
function inspect(node: ReactNode): { buttons: ReactElement[]; text: string } {
  const buttons: ReactElement[] = [];
  const text: string[] = [];
  const walk = (n: ReactNode): void => {
    if (n === null || n === undefined || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") {
      text.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (isValidElement(n)) {
      if (n.type === CheckoutButton) buttons.push(n);
      walk((n.props as { children?: ReactNode }).children);
    }
  };
  walk(node);
  return { buttons, text: text.join(" ") };
}

const page = async (params: Record<string, string>) =>
  inspect(await CheckoutPage({ searchParams: Promise.resolve(params) }));

async function seedPrivate(ownerId = "creator1") {
  const m = await createMedia({ ownerId, type: "video", visibility: "private", unlockPriceCents: 499, title: "Clip" });
  await updateMedia(m.id, { status: "live", processingStatus: "ready" });
  return m;
}

async function grant(type: AccessType, opts: { creatorId?: string; mediaId?: string } = {}) {
  await createEntitlement({
    userId: "buyer",
    scope: opts.mediaId ? "media" : "creator",
    creatorId: opts.mediaId ? null : (opts.creatorId ?? "creator1"),
    mediaId: opts.mediaId ?? null,
    type,
    startsAt: new Date(Date.now() - DAY),
    endsAt: type === "monthly" ? new Date(Date.now() + DAY) : null,
  });
}

beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", undefined);
  resetMemoryMedia();
  resetMemoryPayments();
  resetMemoryPricing();
  resetMemoryPlatformSettings();
  await setCreatorPricing("creator1", { monthlyPriceCents: 999, yearlyPriceCents: 9900, oneTimePriceCents: 2501 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/checkout page", () => {
  it("shows the Pay button to an eligible buyer", async () => {
    as("buyer");
    const m = await seedPrivate();
    expect((await page({ type: "per_video", media: m.id })).buttons).toHaveLength(1);
    for (const type of ["monthly", "yearly", "one_time"]) {
      expect((await page({ type, creator: "creator1" })).buttons).toHaveLength(1);
    }
  });

  it("shows no Pay button to the owner of the item or collection", async () => {
    as("creator1");
    const m = await seedPrivate();
    const item = await page({ type: "per_video", media: m.id });
    expect(item.buttons).toHaveLength(0);
    expect(item.text).toContain("This is your own content");
    for (const type of ["monthly", "yearly", "one_time"]) {
      const coll = await page({ type, creator: "creator1" });
      expect(coll.buttons).toHaveLength(0);
      expect(coll.text).toContain("This is your own content");
    }
  });

  it("shows no Pay button for an item the viewer can already access", async () => {
    as("buyer");
    const viaVideo = await seedPrivate();
    await grant("per_video", { mediaId: viaVideo.id });
    const a = await page({ type: "per_video", media: viaVideo.id });
    expect(a.buttons).toHaveLength(0);
    expect(a.text).toContain("You already have access");

    const viaCollection = await seedPrivate();
    await grant("monthly");
    const b = await page({ type: "per_video", media: viaCollection.id });
    expect(b.buttons).toHaveLength(0);
    expect(b.text).toContain("You already have access");
  });

  it("shows no collection Pay button to a holder of a valid one-time grant", async () => {
    as("buyer");
    await grant("one_time");
    for (const type of ["monthly", "yearly", "one_time"]) {
      const res = await page({ type, creator: "creator1" });
      expect(res.buttons).toHaveLength(0);
      expect(res.text).toContain("You already have access");
    }
  });

  it("still offers monthly/yearly while only a timed grant is active (terms stack)", async () => {
    as("buyer");
    await grant("monthly");
    expect((await page({ type: "monthly", creator: "creator1" })).buttons).toHaveLength(1);
    expect((await page({ type: "yearly", creator: "creator1" })).buttons).toHaveLength(1);
  });

  it("shows the unavailable message for unknown or unpriced offers", async () => {
    as("buyer");
    const res = await page({ type: "monthly", creator: "nobody" });
    expect(res.buttons).toHaveLength(0);
    expect(res.text).toContain("This purchase is not available.");
  });
});
