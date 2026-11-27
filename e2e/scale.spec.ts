import { expect, test, type Page } from "@playwright/test";

// T-034 (F5; VN-SCN-004, VN-CAM-004): reference views at a fixed time from Earth-Moon to 150 AU, compared with
// committed screenshots, and a jitter check: with time paused, a 1 m camera move at 20,000 km from Earth (1 AU from
// the Sun, where float32 world positions would be off by kilometres) leaves the frame unchanged.

const T = "2026-01-01T00:00:00Z";
const LAYERS = "bodies,orbits,markers";

/** The shell's panels and bars are masked: the screenshots are of the 3D view. */
async function view(page: Page, cam: string): Promise<Buffer> {
  await page.goto(`./?t=${T}&cam=${cam}&still=1&layers=${LAYERS}`);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  await expect(canvas).toHaveAttribute("data-orbits", "9", { timeout: 10_000 });
  // A few frames after everything is placed, so the shot is of a settled frame.
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      ),
  );
  return page.screenshot({ mask: [page.locator("header"), page.locator("aside"), page.locator("footer")] });
}

const VIEWS = [
  { name: "earth-moon", cam: "399,1.2e6,30,25" }, // Earth and the Moon's orbit
  { name: "inner", cam: "10,6e8,0,35" }, // about 4 AU: Mercury to Mars
  { name: "outer", cam: "10,1.2e10,0,30" }, // about 80 AU: to Neptune
  { name: "150au", cam: "10,2.244e10,0,20" }, // 150 AU
];

test.describe("reference views", () => {
  for (const v of VIEWS) {
    test(`VN-SCN-004, VN-CAM-004: ${v.name}`, async ({ page }) => {
      const shot = await view(page, v.cam);
      expect(shot).toMatchSnapshot(`${v.name}.png`, { maxDiffPixelRatio: 0.002 });
    });
  }

  test("VN-SCN-004: jitter check: still frames repeat, and a 1 m camera move changes at most a few pixels", async ({
    page,
  }) => {
    const a = await view(page, "399,20000,30,25");
    const b = await view(page, "399,20000,30,25");
    const c = await view(page, "399,20000.001,30,25");
    expect(b.equals(a)).toBe(true); // a still view renders the same frame every time
    expect(a).toMatchSnapshot("jitter.png", { maxDiffPixelRatio: 0.002 });
    // A 1 m move shifts shading by a level in a pixel or two; float32 jitter would move the whole disc edge
    // (about 1,800 px of it) by a pixel or more.
    expect(c).toMatchSnapshot("jitter.png", { maxDiffPixels: 10 });
  });
});
