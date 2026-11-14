import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createMedia,
  getMedia,
  setMediaAsset,
  listLiveByCategory,
  listLiveByOwner,
  updateMedia,
} from "@/lib/media/records";
import {
  createTransaction,
  getTransactionByProviderRef,
  markCreatorPayoutsPaid,
  setTransactionProviderRef,
} from "@/lib/payments/records";
import { applyPaymentEvent } from "@/lib/payments/reconcile";
import { getMoneyFlowReport } from "@/lib/payments/report";

const hasDb = !!process.env.DATABASE_URL;

describe.runIf(hasDb)("real Postgres integration (Task 2 verification)", () => {
  it("exercises core Prisma paths without BigInt/enum/cast leaks", async () => {
    const prisma = new PrismaClient();
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      // create user
      const user = await prisma.user.create({
        data: {
          email: `pg_${suffix}@example.com`,
          handle: `pg_${suffix}`,
          role: "creator",
          ageConfirmedAt: new Date(),
          settings: { create: { feedLayout: "immersive", privacyPrefs: {}, messagingPrefs: {} } },
          profile: { create: { displayName: "PG User" } },
        },
        select: { id: true },
      });

      // category exists from seed; create media, set asset, publish live
      const media = await createMedia({
        ownerId: user.id,
        type: "video",
        visibility: "public",
        title: "PG Media",
        categorySlug: "new",
        durationSec: 12,
        sizeBytes: 12345,
        format: "video/mp4",
      });
      expect(typeof media.sizeBytes).toBe("number");

      const assetOk = await setMediaAsset(media.id, {
        kind: "original",
        storageKey: `media/${media.id}/original.mp4`,
        contentType: "video/mp4",
        sizeBytes: 12345,
      });
      expect(assetOk).toBe(true);

      const live = await updateMedia(media.id, {
        status: "live",
        processingStatus: "ready",
        publishedAt: new Date(),
      });
      expect(live?.status).toBe("live");
      expect(live?.processingStatus).toBe("ready");
      expect(live?.visibility).toBe("public");
      expect(typeof live?.sizeBytes).toBe("number");

      const byCat = await listLiveByCategory("new", 50);
      expect(byCat.some((m) => m.id === media.id)).toBe(true);
      const byOwner = await listLiveByOwner(user.id, 50);
      expect(byOwner.some((m) => m.id === media.id)).toBe(true);

      const fetched = await getMedia(media.id);
      expect(fetched?.assets[0]?.storageKey).toBe(`media/${media.id}/original.mp4`);
      expect(fetched?.assets[0]?.kind).toBe("original");

      // create transaction, set provider ref, settle webhook event
      const tx = await createTransaction({
        buyerId: user.id,
        creatorId: user.id,
        mediaId: media.id,
        accessType: "one_time",
        grossCents: 1000,
        platformFeeCents: 200,
        creatorEarningsCents: 800,
        creatorShareBps: 8000,
        provider: "fake",
      });
      expect(typeof tx.grossCents).toBe("number");
      expect(typeof tx.platformFeeCents).toBe("number");
      expect(typeof tx.creatorEarningsCents).toBe("number");

      const ref = `pg_ref_${suffix}`;
      const withRef = await setTransactionProviderRef(tx.id, ref);
      expect(withRef?.providerRef).toBe(ref);
      const byRef = await getTransactionByProviderRef("fake", ref);
      expect(byRef?.id).toBe(tx.id);

      const settle = await applyPaymentEvent("fake", {
        eventId: `pg_evt_${suffix}`,
        type: "payment.completed",
        providerRef: ref,
      });
      expect(settle).toBe("applied");

      const report = await getMoneyFlowReport();
      expect(typeof report.totals.count).toBe("number");
      expect(typeof report.totals.grossCents).toBe("number");
      expect(typeof report.totals.platformFeeCents).toBe("number");
      expect(typeof report.totals.creatorEarningsCents).toBe("number");
      expect(report.totals.grossCents).toBeGreaterThanOrEqual(1000);
      expect(report.byAccessType.one_time.count).toBeGreaterThanOrEqual(1);

      const payout = await markCreatorPayoutsPaid(user.id);
      expect(typeof payout.markedCount).toBe("number");
      expect(typeof payout.paidCents).toBe("number");
      expect(payout.markedCount).toBeGreaterThanOrEqual(1);
      expect(payout.paidCents).toBeGreaterThanOrEqual(800);
    } finally {
      await prisma.$disconnect();
    }
  });
});
