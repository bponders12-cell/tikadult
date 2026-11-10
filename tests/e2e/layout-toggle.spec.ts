import { test, expect } from "@playwright/test";

test.describe("layout toggle (Task 5)", () => {
  test("settings redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("settings API rejects unauthenticated access", async ({ request }) => {
    const res = await request.get("/api/settings");
    expect(res.status()).toBe(401);
  });
});
