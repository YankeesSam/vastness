import { expect, test } from "@playwright/test";

// T-057 (VN-SCL-005): distance callouts from the selection to the Sun and Earth in the real scene.

test.describe("distance callouts", () => {
  test("VN-SCL-005: choosing Mars draws lines to the Sun and Earth, labelled with distance and light-time", async ({
    page,
  }) => {
    await page.goto("./?t=2026-01-01T00:00:00Z&still=1");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-callouts", "");
    await page.getByRole("region", { name: "Objects" }).getByRole("button", { name: "Mars", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-follow", "499", { timeout: 10_000 });
    // Mars on 2026-01-01: about 1.4 AU from the Sun, on the far side of the Sun from Earth (about 2.4 AU)
    await expect(canvas).toHaveAttribute(
      "data-callouts",
      /^Sun: 2\d\d million km · 1\d(\.\d+)? light-minutes\|Earth: 3\d\d million km · [12]\d(\.\d+)? light-minutes$/,
    );
    const labels = page.getByTestId("callouts");
    await expect(labels.getByText(/^Sun: /)).toBeVisible();
    await expect(labels.getByText(/^Earth: /)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("callouts-mars.png") });
    await page
      .getByRole("region", { name: "Layers" })
      .getByRole("checkbox", { name: /Distances/ })
      .uncheck();
    await expect(canvas).toHaveAttribute("data-callouts", "");
    await expect(labels.getByText(/^Sun: /)).toBeHidden();
  });

  test("VN-SCL-005: with Earth selected, one line, to the Sun", async ({ page }) => {
    await page.goto("./?t=2026-01-01T00:00:00Z&still=1");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await page.getByRole("region", { name: "Objects" }).getByRole("button", { name: "Earth", exact: true }).click();
    // Earth near perihelion on 2026-01-01: 0.983 AU, 147 million km, 8.18 light-minutes
    await expect(canvas).toHaveAttribute("data-callouts", "Sun: 147 million km · 8.18 light-minutes", {
      timeout: 10_000,
    });
  });
});
