import { expect, test, type Page } from "@playwright/test";
import { presetCamera, PRESETS } from "../src/core/camera/presets";

// T-066 (VN-SCN-005, VN-SCN-006, VN-SCN-007): visual regression baselines at a fixed time, in SwiftShader, for the
// user's review: every preset view with the stars on, the Sun and its glow up close, and Saturn with its rings.
// Panels, bars and the scale bar are masked, as in the F5 views (e2e/scale.spec.ts).

const T = "2026-01-01T00:00:00Z";
const STAR_COUNT = "8404";

async function shot(page: Page, cam: string, layers: string, t = T): Promise<Buffer> {
  await page.goto(`./?t=${t}&cam=${cam}&still=1&layers=${layers}`);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  if (layers.includes("stars")) await expect(canvas).toHaveAttribute("data-stars", STAR_COUNT, { timeout: 10_000 });
  if (layers.includes("orbits")) await expect(canvas).toHaveAttribute("data-orbits", "9", { timeout: 10_000 });
  if (layers.includes("spaceweather"))
    await expect(canvas).toHaveAttribute("data-space-weather", /^[1-9]/, { timeout: 10_000 });
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
  return page.screenshot({
    mask: [
      page.locator("header"),
      page.locator("aside"),
      page.locator("footer"),
      page.getByRole("figure", { name: "Scale" }),
    ],
  });
}

const deg = (rad: number) => (rad * 180) / Math.PI;

test.describe("visual baselines", () => {
  for (const p of PRESETS) {
    test(`VN-SCN-007: preset ${p.id} with the stars`, async ({ page }) => {
      const c = presetCamera(p.id);
      const cam = `${c.target},${c.distanceKm},${deg(c.azimuth)},${deg(c.elevation)}`;
      expect(await shot(page, cam, "bodies,orbits,markers,stars")).toMatchSnapshot(`preset-${p.id}.png`, {
        maxDiffPixelRatio: 0.002,
      });
    });
  }

  test("VN-SCN-005: the Sun up close, an emissive disc in its glow", async ({ page }) => {
    expect(await shot(page, "10,1.2e7,0,15", "bodies,stars")).toMatchSnapshot("sun.png", { maxDiffPixelRatio: 0.002 });
  });

  // At Saturn's northern summer solstice the rings are open to the Sun (26.7 degrees); in 2026 they are near edge-on.
  // T-099 (VN-SCN-010, D-003): Saturn's shadow darkens the ring arc behind it, and the rings shade Saturn.
  test("VN-SCN-006, VN-SCN-005: Saturn and its rings at the 2017 solstice, lit only by the Sun", async ({ page }) => {
    expect(await shot(page, "699,7e5,200,40", "bodies,stars", "2017-05-24T00:00:00Z")).toMatchSnapshot("saturn.png", {
      maxDiffPixelRatio: 0.002,
    });
  });

  // T-099 (VN-SCN-010): eclipse shadows, analytic umbra and penumbra (src/core/shadow.ts).
  // Both cameras look from the Sun's side (azimuth from the ephemeris), so an unshadowed body would be fully lit.
  test("VN-SCN-010: the 2025-03-14 total lunar eclipse: the Moon in Earth's umbra", async ({ page }) => {
    expect(await shot(page, "301,2e4,84,10", "bodies,stars", "2025-03-14T06:58:43Z")).toMatchSnapshot(
      "lunar-eclipse-2025.png",
      { maxDiffPixelRatio: 0.002 },
    );
  });

  test("VN-SCN-010: the 2024-04-08 total solar eclipse: the Moon's shadow on Earth", async ({ page }) => {
    expect(await shot(page, "399,3e4,109,15", "bodies,stars", "2024-04-08T18:17:16Z")).toMatchSnapshot(
      "solar-eclipse-2024.png",
      { maxDiffPixelRatio: 0.002 },
    );
  });

  // T-101 (VN-EXT-005): the 2024-05-10 Gannon storm from above the ecliptic: the May 8-9 CMEs from AR 13664 as
  // shells on their DONKI directions, coloured by speed class, opacity from CDAW mass; arrival rings at Earth.
  test("VN-EXT-005: the 2024-05-10 Gannon storm, CME shells reaching Earth", async ({ page }) => {
    expect(
      await shot(page, "10,4e8,0,60", "bodies,orbits,markers,spaceweather", "2024-05-10T12:00:00Z"),
    ).toMatchSnapshot("gannon-storm-2024.png", { maxDiffPixelRatio: 0.002 });
  });

  test("VN-SCN-007: the stars layer can be turned off from the side panel", async ({ page }) => {
    await page.goto(`./?t=${T}&cam=10,1.2e7,0,15&still=1&layers=bodies,stars`);
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-stars", STAR_COUNT, { timeout: 20_000 });
    const box = page.getByRole("region", { name: "Layers" }).getByRole("checkbox", { name: "Stars" });
    await expect(box).toBeChecked();
    await box.uncheck();
    await expect(box).not.toBeChecked();
    await expect(
      page.getByRole("region", { name: "Sky" }).getByRole("slider", { name: "Star brightness" }),
    ).toBeVisible();
  });
});
