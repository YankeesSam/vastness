import { expect, test } from "@playwright/test";

// T-053 (VN-CAM-005): the preset views in the real scene.

test.describe("preset views", () => {
  test("VN-CAM-005: whole system top-down, heliopause and Earth-Moon", async ({ page }) => {
    test.slow(); // three fly-tos in SwiftShader; with the stars (T-064) it nears 30 s when every worker is busy
    await page.goto("./?t=2026-01-01T00:00:00Z&still=1");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    const views = page.getByRole("region", { name: "Views" });
    for (const [name, follow, distance] of [
      ["Whole system", "10", "1.219e+10"],
      ["Heliopause (Voyagers)", "10", "7.218e+10"],
      ["Earth and Moon", "399", "1.090e+6"],
    ] as const) {
      await views.getByRole("button", { name, exact: true }).click();
      await expect(canvas).toHaveAttribute("data-follow", follow);
      await expect(canvas).toHaveAttribute("data-camera-distance", distance);
      await page.waitForTimeout(300);
      await page.screenshot({ path: test.info().outputPath(`preset-${follow}-${name.split(" ")[0]}.png`) });
    }
  });
});
