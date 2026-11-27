import { expect, test } from "@playwright/test";

// T-055 (VN-SCL-001, VN-SCL-002, VN-SCL-003): switching between true and exaggerated scale in the real scene.

const EARTH = "./?t=2026-01-01T00:00:00Z&cam=399,2e4,0,20&still=1";

test.describe("scale modes", () => {
  test("VN-SCL-003: the switch animates over about 1 s and keeps the followed Earth framed", async ({ page }) => {
    await page.goto(EARTH);
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-scale-amount", "0.00");
    await expect(canvas).toHaveAttribute("data-camera-distance", "2.000e+4");
    // VN-SCL-004: the scale bar reads the view width (2 x 20,000 km x tan 25 deg x 1280/(800 - bars) at the focus)
    const bar = page.getByRole("figure", { name: "Scale" }).locator("figcaption");
    await expect(bar).toHaveText(/^View width \d\d,\d00 km · .* AU · \d+(\.\d+)? light-milliseconds$/);
    await page.getByRole("combobox", { name: "Scale mode" }).selectOption("exaggerated");
    // part way: neither end
    await page.waitForFunction(() => {
      const a = Number(document.querySelector("canvas")?.dataset.scaleAmount);
      return a > 0 && a < 1;
    });
    await expect(canvas).toHaveAttribute("data-scale-amount", "1.00");
    // VN-SCL-002: Earth x1000, and the camera moved out with it (same apparent size), still following Earth
    await expect(canvas).toHaveAttribute("data-follow", "399");
    await expect(canvas).toHaveAttribute("data-camera-distance", "2.000e+7");
    await expect(page.getByRole("note")).toContainText("Sun ×40");
    await expect(bar).toContainText("million km");
    // VN-UI-002: the link carries the mode
    await expect.poll(() => page.evaluate(() => location.hash)).toContain("x=e");
    await page.screenshot({ path: test.info().outputPath("exaggerated-earth.png") });

    // back to true scale: the same view as before
    await page.getByRole("combobox", { name: "Scale mode" }).selectOption("true");
    await expect(canvas).toHaveAttribute("data-scale-amount", "0.00");
    await expect(canvas).toHaveAttribute("data-camera-distance", "2.000e+4");
    await expect(page.getByRole("note")).toHaveCount(0);
  });

  test("VN-SCL-003: with reduced motion the switch is instant", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(EARTH);
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await page.evaluate(() => {
      const c = document.querySelector("canvas")!;
      const seen: string[] = [];
      new MutationObserver(() => seen.push(c.dataset.scaleAmount ?? "")).observe(c, {
        attributes: true,
        attributeFilter: ["data-scale-amount"],
      });
      (window as unknown as { seen: string[] }).seen = seen;
    });
    await page.getByRole("combobox", { name: "Scale mode" }).selectOption("exaggerated");
    await expect(canvas).toHaveAttribute("data-scale-amount", "1.00");
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(["1.00"]);
  });

  test("VN-SCL-001, VN-SCL-002: a view can start exaggerated; markers and labels off leave the bodies", async ({
    page,
  }) => {
    await page.goto("./?t=2026-01-01T00:00:00Z&cam=10,4.2e8,0,35&still=1&scale=exaggerated");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-scale-amount", "1.00");
    await expect(page.getByRole("combobox", { name: "Scale mode" })).toHaveValue("exaggerated");
    await expect(canvas).toHaveAttribute("data-labels", /Earth/);
    const layers = page.getByRole("region", { name: "Layers" });
    await layers.getByRole("checkbox", { name: "Markers" }).uncheck();
    await layers.getByRole("checkbox", { name: "Labels" }).uncheck();
    await expect(canvas).toHaveAttribute("data-labels", "");
    await page.screenshot({ path: test.info().outputPath("exaggerated-inner-bare.png") });
  });

  test("D-002: in exaggerated scale a trail meets its marker (LRO at the stretched Moon)", async ({ page }) => {
    await page.goto(
      "./?t=2026-01-01T00:00:00Z&cam=301,2e7,0,30&still=1&layers=bodies,markers,trails&scale=exaggerated",
    );
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-scale-amount", "1.00");
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-trails")), { timeout: 10_000 })
      .toBeGreaterThan(0);
    // The Moon is drawn ~13 million km out from Earth; a trail left at true positions would part from LRO by that.
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-trail-gap")), { timeout: 10_000 })
      .toBeLessThan(1);
    await page.screenshot({ path: test.info().outputPath("exaggerated-lro.png") });
    await page.getByRole("combobox", { name: "Scale mode" }).selectOption("true");
    await expect(canvas).toHaveAttribute("data-scale-amount", "0.00");
    await expect.poll(async () => Number(await canvas.getAttribute("data-trail-gap"))).toBeLessThan(1);
  });
});
