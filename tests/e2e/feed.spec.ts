import { test, expect } from "@playwright/test";

async function confirmAgeGate(page: import("@playwright/test").Page, next = "/c/new") {
  await page.goto(`/age-gate?next=${encodeURIComponent(next)}`);
  await page.getByLabel(/I am 18 years of age or older/i).check();
  await page.getByRole("button", { name: /enter site/i }).click();
  await page.waitForURL((url) => url.pathname === next, { timeout: 10000 });
}

test.describe("category feed shell", () => {
  test("category page loads and feed renders slides after age confirmation", async ({ page }) => {
    await confirmAgeGate(page, "/c/new");

    await expect(page.getByTestId("category-title")).toHaveText(/new/i);
    await expect(page.getByTestId("feed-shell")).toHaveAttribute("data-layout", "immersive");
    await expect(page.getByTestId("swipe-feed")).toBeVisible();

    const slides = page.getByTestId("video-slide");
    await expect(slides).toHaveCount(3);
    await expect(page.getByLabel("Video actions").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Rate" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Comment" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Share" }).first()).toBeVisible();
  });

  test("layout toggle switches layout class/state", async ({ page }) => {
    await confirmAgeGate(page, "/c/featured");

    const shell = page.getByTestId("feed-shell");
    await expect(shell).toHaveAttribute("data-layout", "immersive");

    await page.getByRole("button", { name: "Side" }).click();
    await expect(shell).toHaveAttribute("data-layout", "side");
    await expect(shell).toHaveClass(/layout-side/);
    await expect(page.getByRole("heading", { name: "Comments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Featured" })).toBeVisible();

    await page.getByRole("button", { name: "Immersive" }).click();
    await expect(shell).toHaveAttribute("data-layout", "immersive");
    await expect(shell).toHaveClass(/layout-immersive/);
  });
});
