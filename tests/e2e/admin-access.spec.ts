import { test, expect } from "@playwright/test";

test("unauthenticated user cannot access admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin$/);
});
test("unauthenticated user cannot see the money-flow page", async ({ page }) => {
  await page.goto("/admin/money");
  await expect(page).not.toHaveURL(/\/admin\/money$/);
  await expect(page.getByText("Money flow")).toHaveCount(0);
});
