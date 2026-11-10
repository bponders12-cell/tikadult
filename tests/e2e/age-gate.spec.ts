import { test, expect } from "@playwright/test";

test("deep link to category is gated", async ({ page }) => {
  await page.goto("/c/new");
  await expect(page).toHaveURL(/age-gate/);
});
