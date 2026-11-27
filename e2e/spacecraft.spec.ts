import { expect, test } from "@playwright/test";

// T-044 (VN-CAT-006): a simple spacecraft model within 10,000 km of the camera; markers only beyond.

test.describe("spacecraft model", () => {
  test("VN-CAT-006: none at the default view; flying to JWST draws its model", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("./?t=2026-01-01T00:00:00Z");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-models", "");
    const search = page.getByRole("searchbox", { name: "Search objects" });
    await search.fill("webb");
    await search.press("Enter");
    await expect(canvas).toHaveAttribute("data-models", "James Webb Space Telescope", { timeout: 10_000 });
    await page.waitForTimeout(4500); // the fly-to settles (under 4 s, VN-CAM-002)
    await page.screenshot({ path: test.info().outputPath("jwst-model.png") });
    expect(errors).toEqual([]);
  });
});
