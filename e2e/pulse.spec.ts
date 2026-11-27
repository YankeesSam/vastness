import { expect, test } from "@playwright/test";

// T-058 (VN-SCL-007): the light-speed pulse in the real scene.

test.describe("light-speed pulse", () => {
  test("VN-SCL-007: a pulse from the Sun reaches 1 AU after 499 s of simulation time", async ({ page }) => {
    await page.goto("./?t=2026-01-01T00:00:00Z&cam=10,6e8,0,35&still=1");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-pulse", "");
    const region = page.getByRole("region", { name: "Light pulse" });
    await region.getByRole("button", { name: "From the Sun" }).click();
    // paused: the pulse has not left yet (radius 0 draws nothing)
    await expect(canvas).toHaveAttribute("data-pulse", "");
    // 499.004784 s later (IAU light-time for 1 AU), through the link's time field (to the ms)
    await page.evaluate(() => {
      location.hash = "v=1&t=2026-01-01T00:08:19.005Z&p=1";
    });
    await expect(canvas).toHaveAttribute("data-pulse", "1.496e+8");
    await expect(region).toContainText("Light from the Sun: 150 million km out after 8.32 minutes.");
    await page.screenshot({ path: test.info().outputPath("pulse-1au.png") });
    await region.getByRole("button", { name: "Stop" }).click();
    await expect(canvas).toHaveAttribute("data-pulse", "");
  });
});
