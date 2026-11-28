import { expect, test } from "@playwright/test";

// T-107 (VN-EXT-015): comets from Horizons as a layer, with tails. Off by default; on, at Tsuchinshan-ATLAS's
// October 2024 apparition (0.5 au from the Sun) its tails are drawn, while Halley, beyond Neptune's orbit, has none.

const ATLAS = "2024-10-10T00:00:00Z";

test("VN-EXT-015: comets are off by default: no tails, no comet labels", async ({ page }) => {
  await page.goto(`./?t=${ATLAS}&still=1&cam=10,4e8,0,60`);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  await expect(canvas).toHaveAttribute("data-comet-tails", "0");
  await expect(canvas).not.toHaveAttribute("data-labels", /Tsuchinshan-ATLAS|Halley/);
});

test("VN-EXT-015: with the layer on, an active comet near the Sun has tails and a label; Halley far out has none", async ({
  page,
}) => {
  await page.goto(`./?t=${ATLAS}&still=1&cam=10,4e8,0,60&layers=bodies,markers,labels,trails,comets`);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  // Inside 5 au in October 2024: Tsuchinshan-ATLAS (0.5 au) and the Jupiter-family comets near perihelion; never
  // all nine (Halley is near aphelion, about 35 au out).
  await expect(canvas).toHaveAttribute("data-comet-tails", /^[1-8]$/, { timeout: 15_000 });
  await expect(canvas).toHaveAttribute("data-labels", /Tsuchinshan-ATLAS/, { timeout: 15_000 });
});
