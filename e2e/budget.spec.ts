import { expect, test, type Page } from "@playwright/test";

// T-073 (VN-PRF-002): render budgets from renderer.info on the reference scene (docs/TESTBED.md): all planets, all
// catalog spacecraft with 2-year trails (a year back and ahead), labels, stars, at 1920x1080. The limits are in
// docs/TESTBED.md, set from the first measurement with headroom, and only ever tightened.
const REFERENCE = "./?t=2026-01-01T00:00:00Z&still=1&cam=10,1.2e9,30,25";
const BUDGET = { drawCalls: 64, triangles: 100_000, textureBytes: 64 * 1024 * 1024 };

test.use({ viewport: { width: 1920, height: 1080 } });

async function settled(page: Page) {
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 30_000 });
  await expect(canvas).toHaveAttribute("data-stars", /^\d+$/, { timeout: 30_000 });
  const n = async (k: string) => Number(await canvas.getAttribute(k));
  // Trails sampled and a few frames drawn with everything in: the draw calls hold for a second (under load the
  // trails can take several seconds after the scene is ready).
  let last = -1;
  await expect
    .poll(
      async () => {
        const now = await n("data-draw-calls");
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [1000], timeout: 30_000 },
    )
    .toBe(true);
  return {
    drawCalls: await n("data-draw-calls"),
    triangles: await n("data-triangles"),
    textures: await n("data-textures"),
    textureBytes: await n("data-texture-bytes"),
    stars: await n("data-stars"),
    quality: await canvas.getAttribute("data-quality"),
  };
}

test("VN-PRF-002: draw calls, triangles and texture memory on the reference scene are within budget", async ({
  page,
}) => {
  await page.goto(REFERENCE);
  const r = await settled(page);
  console.log("reference scene:", JSON.stringify(r));
  test.info().annotations.push({ type: "renderer.info", description: JSON.stringify(r) });
  expect(r.quality).toBe("high");
  expect(r.drawCalls).toBeGreaterThan(0);
  expect(r.drawCalls).toBeLessThanOrEqual(BUDGET.drawCalls);
  expect(r.triangles).toBeLessThanOrEqual(BUDGET.triangles);
  expect(r.textureBytes).toBeLessThanOrEqual(BUDGET.textureBytes);
});

test("VN-PRF-003: the low tier chosen in settings draws fewer stars and no more draw calls", async ({ page }) => {
  await page.goto(REFERENCE);
  const high = await settled(page);
  await page.evaluate(() => localStorage.setItem("vastness.prefs", JSON.stringify({ quality: "low" })));
  await page.reload();
  const low = await settled(page);
  expect(low.quality).toBe("low");
  expect(low.stars).toBeGreaterThan(0);
  expect(low.stars).toBeLessThan(high.stars);
  expect(low.drawCalls).toBeLessThanOrEqual(high.drawCalls);
  await expect(page.getByRole("combobox", { name: "Quality" })).toHaveValue("low");
});
