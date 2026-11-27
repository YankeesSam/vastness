import { expect, test } from "@playwright/test";

// T-033 (VN-INF-001, VN-INF-002, VN-INF-004): choosing a body shows its read-outs; the unit choice sticks.

test.describe("info panel", () => {
  test("VN-INF-001, VN-INF-004: Mars's read-outs in km, then AU after a reload", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("canvas")).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await page.getByRole("button", { name: "Mars", exact: true }).click();
    const info = page.getByRole("region", { name: "Info" });
    await expect(info.getByRole("heading", { name: "Mars" })).toBeVisible();
    const readouts = info.getByLabel("Read-outs");
    await expect(readouts).toContainText(/Distance from the Sun\s*2\d\d,\d{3},\d{3} km/); // 206.6 to 249.3 million km
    await expect(readouts).toContainText(/\d+ m \d\d s/);
    await page.screenshot({ path: test.info().outputPath("info-mars.png") });
    await info.getByRole("combobox", { name: "Distance units" }).selectOption("au");
    await expect(readouts).toContainText(/1\.\d{5} AU/);
    await page.reload();
    await page.getByRole("button", { name: "Mars", exact: true }).click();
    await expect(page.getByRole("region", { name: "Info" }).getByLabel("Read-outs")).toContainText(/1\.\d{5} AU/);
  });
});
