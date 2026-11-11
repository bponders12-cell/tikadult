import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));

import { POST as checkout } from "@/app/api/payments/checkout/route";
import { POST as simulate } from "@/app/api/payments/fake/simulate/route";
import { GET as deliver } from "@/app/api/media/[id]/asset/[kind]/route";
import { createMedia, resetMemoryMedia, setMediaAsset, updateMedia } from "@/lib/media/records";
import { getStorage } from "@/lib/media/storage";
import { getTransaction, resetMemoryPayments } from "@/lib/payments/records";
import { resetMemoryPricing } from "@/lib/payments/pricing";
import { resetMemoryPlatformSettings } from "@/lib/platform-settings";

const as = (id: string) => getSession.mockResolvedValue({ user: { id, role: "viewer" } });
const post = (handler: (r: Request) => Promise<Response>, url: string, body: unknown) =>
  handler(
    new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  );
const fetchAsset = (id: string) =>
  deliver(new Request(`http://x/api/media/${id}/asset/web`), { params: Promise.resolve({ id, kind: "web" }) });

let dir: string;
beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("PAYMENT_PROVIDER", undefined);
  vi.stubEnv("PAYMENTS_WEBHOOK_SECRET", undefined);
  vi.stubEnv("NEXTAUTH_URL", undefined);
  dir = await mkdtemp(path.join(tmpdir(), "purchase-smoke-"));
  vi.stubEnv("LOCAL_STORAGE_DIR", dir);
  resetMemoryMedia();
  resetMemoryPayments();
  resetMemoryPricing();
  resetMemoryPlatformSettings();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe("purchase smoke: checkout -> fake hosted payment -> playback", () => {
  it("unlocks a priced private item for the buyer only", async () => {
    const m = await createMedia({ ownerId: "creator1", type: "video", visibility: "private", unlockPriceCents: 499 });
    await getStorage().put(`media/${m.id}/web`, Uint8Array.from([4, 5, 6]));
    await setMediaAsset(m.id, { kind: "web", storageKey: `media/${m.id}/web`, contentType: "video/mp4", sizeBytes: 3 });
    await updateMedia(m.id, { status: "live", processingStatus: "ready" });

    as("buyer");
    expect((await fetchAsset(m.id)).status).toBe(404);

    const started = await post(checkout, "http://local.test/api/payments/checkout", {
      accessType: "per_video",
      mediaId: m.id,
    });
    expect(started.status).toBe(201);
    const { transactionId, redirectUrl } = await started.json();
    expect(redirectUrl).toBe(`/checkout/fake?tx=${transactionId}`);

    const paid = await post(simulate, "http://local.test/api/payments/fake/simulate", {
      transactionId,
      outcome: "completed",
    });
    expect(paid.status).toBe(200);
    expect(await paid.json()).toEqual({ result: "applied", status: "completed" });
    expect(await getTransaction(transactionId)).toMatchObject({
      status: "completed",
      grossCents: 499,
      creatorEarningsCents: 399,
      platformFeeCents: 100,
    });

    const res = await fetchAsset(m.id);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(Uint8Array.from([4, 5, 6]));

    as("someone-else");
    expect((await fetchAsset(m.id)).status).toBe(404);
  });
});
