import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// T-069 (VN-ACC-003): the DOM interface meets WCAG 2.2 AA (axe-core) in every theme and with large text.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function audit(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const summary = r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary).toEqual([]);
}

async function menu(page: Page, item: string | RegExp) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menu").getByText(item).click();
}

test.describe("accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("canvas")).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  });

  test("VN-ACC-003: axe finds no WCAG 2.2 AA violations in the dark theme, with an object selected", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Mars" }).click();
    await audit(page);
  });

  test("VN-ACC-003: light and high-contrast themes and large text also pass axe", async ({ page }) => {
    await page.getByRole("button", { name: "Mars" }).click();
    await menu(page, "Light theme");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await audit(page);
    await menu(page, "High contrast");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");
    await audit(page);
    const before = await page.locator("body").evaluate((b) => parseFloat(getComputedStyle(b).fontSize));
    await menu(page, "Large text");
    await expect(page.locator("html")).toHaveAttribute("data-text", "large");
    const after = await page.locator("body").evaluate((b) => parseFloat(getComputedStyle(b).fontSize));
    expect(after).toBeGreaterThanOrEqual(before * 1.25);
    await audit(page);
    // remembered across a reload (VN-GEN-008)
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");
    await expect(page.locator("html")).toHaveAttribute("data-text", "large");
  });
});
