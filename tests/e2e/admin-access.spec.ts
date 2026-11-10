import { test, expect } from "@playwright/test";

test("unauthenticated user cannot access admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin$/);
});