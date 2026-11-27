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

// T-090 (VN-EPH-011): an orbiter past its stored span is drawn on an illustrative orbit, labelled as such.
test.describe("illustrative orbit", () => {
  test("VN-EPH-011: CAPSTONE after its trajectory ends is on an illustrative orbit; inside it, it is not", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("./?t=2026-11-26T00:00:00Z"); // CAPSTONE's Horizons trajectory ends on 2026-08-14
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-illustrative", /CAPSTONE/, { timeout: 10_000 });
    const search = page.getByRole("searchbox", { name: "Search objects" });
    await search.fill("CAPSTONE");
    await search.press("Enter");
    await expect(page.getByTestId("no-position")).toContainText("illustrative orbit", { timeout: 10_000 });
    await expect(page.getByTestId("no-position")).toContainText("not at its true position");

    await page.goto("./?t=2025-06-01T00:00:00Z");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await page.waitForTimeout(1000);
    expect((await canvas.getAttribute("data-illustrative")) ?? "").not.toMatch(/CAPSTONE/);
    expect(errors).toEqual([]);
  });
});
