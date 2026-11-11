import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { createSessionToken } from "../../src/lib/auth";
import { mp4 } from "../unit/helpers/media-fixtures";

/**
 * Browser purchase flow against `npm run dev` with the fake provider. There is no Postgres in dev
 * here, so real login is impossible: sessions are forged with createSessionToken (same default
 * dev secret as the server) and the priced private item is created through the media API.
 */

const BASE = "http://127.0.0.1:3000";
const run = Date.now().toString(36);
const creator = { id: `e2e-creator-${run}`, role: "creator" as const };
const buyer = { id: `e2e-buyer-${run}`, role: "viewer" as const };

const sessionHeaders = (user: { id: string; role: "creator" | "viewer" }) => ({
  cookie: `session=${createSessionToken(user)}; age_confirmed=1`,
});

async function createPrivateItem(request: APIRequestContext): Promise<string> {
  const headers = sessionHeaders(creator);
  const bytes = mp4(2);
  const init = await request.post("/api/media", {
    headers,
    data: { contentType: "video/mp4", sizeBytes: bytes.length, title: "E2E private", visibility: "private", unlockPriceCents: 499 },
  });
  expect(init.status()).toBe(201);
  const { media, upload } = await init.json();
  const put = await request.put(upload.url, { headers: { ...headers, "content-type": "video/mp4" }, data: bytes });
  expect(put.status()).toBe(200);
  const done = await request.post(`/api/media/${media.id}/complete`, { headers });
  expect(done.status()).toBe(200);
  return media.id as string;
}

async function signIn(context: BrowserContext, user: { id: string; role: "creator" | "viewer" }) {
  await context.addCookies([
    { name: "session", value: createSessionToken(user), url: BASE },
    { name: "age_confirmed", value: "1", url: BASE },
  ]);
}

test("buyer unlocks a private video through the fake hosted checkout", async ({ page, context, request }) => {
  const mediaId = await createPrivateItem(request);
  await signIn(context, buyer);

  const asset = `/api/media/${mediaId}/asset/web`;
  expect((await page.request.get(asset)).status()).toBe(404);

  await page.goto(`/checkout?type=per_video&media=${mediaId}`);
  await page.getByRole("button", { name: "Pay $4.99" }).click();
  await expect(page).toHaveURL(/\/checkout\/fake\?tx=/);

  await page.getByRole("button", { name: "Pay (simulate success)" }).click();
  await expect(page).toHaveURL(/\/checkout\/result\?tx=/);
  await expect(page.getByRole("status")).toHaveAttribute("data-status", "completed");

  expect((await page.request.get(asset)).status()).toBe(200);
});
