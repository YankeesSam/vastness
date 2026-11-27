import { expect, test } from "@playwright/test";

// T-062 (VN-SCN-006, VN-PRF-002) and T-098 (VN-SCN-009): surface maps load only for bodies drawn large, turned by
// their rotation models; with the layer off, bodies stay plain spheres.

test.describe("surface textures", () => {
  test("VN-SCN-006: close to Earth its map loads; the whole system loads none", async ({ page }) => {
    await page.goto("./?t=2026-06-21T12:00:00Z&cam=399,3e4,180,10&still=1&layers=bodies,textures");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-surfaces", /(^|,)399(,|$)/, { timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: test.info().outputPath("earth-textured.png") });

    await page.goto("./?t=2026-01-01T00:00:00Z&cam=10,1.2e9,30,25&still=1&layers=bodies,textures");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await page.waitForTimeout(1000);
    await expect(canvas).toHaveAttribute("data-surfaces", "");
  });

  test("VN-SCN-006: with the layer off the bodies are plain spheres", async ({ page }) => {
    await page.goto("./?t=2026-06-21T12:00:00Z&cam=399,3e4,0,10&still=1&layers=bodies");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await page.waitForTimeout(1000);
    await expect(canvas).toHaveAttribute("data-surfaces", "");
  });

  test("VN-SCN-006: the Layers switch turns the maps on and off", async ({ page }) => {
    await page.goto("./?t=2026-06-21T12:00:00Z&cam=499,2e4,0,10&still=1");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-surfaces", /499/, { timeout: 15_000 });
    await page.screenshot({ path: test.info().outputPath("mars-textured.png") });
    const layers = page.getByRole("region", { name: "Layers" });
    await layers.getByRole("checkbox", { name: "Surface textures" }).uncheck();
    await expect(canvas).toHaveAttribute("data-surfaces", "");
  });
});
