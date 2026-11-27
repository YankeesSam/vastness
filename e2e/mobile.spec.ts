import { expect, test, type CDPSession, type Page } from "@playwright/test";

// T-074 (VN-PRF-005): touch on a phone-sized screen: one finger orbits, two fingers pinch-zoom and pan, a tap
// selects, and under 768 px the side panel is a bottom sheet. Touches go through CDP Input.dispatchTouchEvent, so
// the page sees real touch pointers. Reference view: Earth from 1.2 million km, time paused.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

const VIEW = "./?t=2026-01-01T00:00:00Z&still=1&cam=399,1.2e6,30,25";

type Point = { x: number; y: number };

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", points: Point[]) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })),
  });
}

/** Moves the fingers from `from` to `to` in steps. */
async function gesture(cdp: CDPSession, from: Point[], to: Point[], steps = 8) {
  await touch(cdp, "touchStart", from);
  for (let k = 1; k <= steps; k++) {
    const at = from.map((p, i) => ({
      x: p.x + ((to[i]!.x - p.x) * k) / steps,
      y: p.y + ((to[i]!.y - p.y) * k) / steps,
    }));
    await touch(cdp, "touchMove", at);
  }
  await touch(cdp, "touchEnd", []);
}

async function open(page: Page) {
  await page.goto(VIEW);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 30_000 });
  await expect(canvas).toHaveAttribute("data-follow", "399");
  const cdp = await page.context().newCDPSession(page);
  const box = (await canvas.boundingBox())!;
  return { canvas, cdp, centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 } };
}

/** The camera azimuth in degrees from the URL fragment (c=target,distance,azimuth,elevation). */
async function azimuth(page: Page): Promise<number> {
  const hash = await page.evaluate(() => location.hash);
  const c = /[#&]c=([^&]*)/.exec(hash)?.[1]?.split(",");
  return Number(c?.[2]);
}

test("VN-PRF-005: under 768 px the side panel is a closed bottom sheet that opens over the view", async ({ page }) => {
  await open(page);
  const panel = page.locator("#side-panel");
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "Side panel" }).click();
  await expect(panel).toBeVisible();
  const sheet = (await panel.boundingBox())!;
  const bar = (await page.getByRole("contentinfo", { name: "Time" }).boundingBox())!;
  expect(sheet.width).toBeGreaterThan(380); // full width
  expect(sheet.height).toBeLessThanOrEqual(844 * 0.55 + 1);
  expect(Math.abs(sheet.y + sheet.height - bar.y)).toBeLessThanOrEqual(1); // sits on the time bar
  // nothing in the top bar runs off the screen
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});

test("VN-PRF-005: one finger orbits, keeping the distance and the followed object", async ({ page }) => {
  const { canvas, cdp, centre } = await open(page);
  await expect.poll(() => azimuth(page)).not.toBeNaN();
  const az0 = await azimuth(page);
  const d0 = await canvas.getAttribute("data-camera-distance");
  await gesture(cdp, [{ x: centre.x - 80, y: centre.y }], [{ x: centre.x + 80, y: centre.y }]);
  await expect.poll(() => azimuth(page)).not.toBe(az0);
  await expect(canvas).toHaveAttribute("data-camera-distance", d0!);
  await expect(canvas).toHaveAttribute("data-follow", "399");
});

test("VN-PRF-005: two fingers pinch to zoom in and out, and do not select", async ({ page }) => {
  const { canvas, cdp, centre } = await open(page);
  const distance = async () => Number(await canvas.getAttribute("data-camera-distance"));
  const d0 = await distance();
  const c = centre;
  // fingers apart: zoom in. The first finger rests on Earth, so lifting it would be a tap if the pinch did not
  // cancel it.
  await gesture(cdp, [c, { x: c.x + 40, y: c.y }], [c, { x: c.x + 160, y: c.y }]);
  await expect.poll(distance).toBeLessThan(d0 * 0.6);
  const d1 = await distance();
  // fingers together: zoom out
  await gesture(
    cdp,
    [
      { x: c.x - 120, y: c.y },
      { x: c.x + 120, y: c.y },
    ],
    [
      { x: c.x - 40, y: c.y },
      { x: c.x + 40, y: c.y },
    ],
  );
  await expect.poll(distance).toBeGreaterThan(d1 * 1.6);
  // a pinch over Earth never selected it
  await page.getByRole("button", { name: "Side panel" }).click();
  await expect(page.getByRole("region", { name: "Info" })).toContainText("Select an object");
});

test("VN-PRF-005: two fingers moved together pan, which releases follow", async ({ page }) => {
  const { canvas, cdp, centre: c } = await open(page);
  await gesture(
    cdp,
    [
      { x: c.x - 50, y: c.y },
      { x: c.x + 50, y: c.y },
    ],
    [
      { x: c.x - 50, y: c.y + 120 },
      { x: c.x + 50, y: c.y + 120 },
    ],
  );
  await expect(canvas).toHaveAttribute("data-follow", "");
});

test("VN-PRF-005: a tap on Earth selects it", async ({ page }) => {
  const { cdp, centre } = await open(page);
  await touch(cdp, "touchStart", [centre]);
  await touch(cdp, "touchEnd", []);
  await page.getByRole("button", { name: "Side panel" }).click();
  await expect(page.getByRole("region", { name: "Info" })).toContainText("Earth");
  await expect(page.getByRole("region", { name: "Info" })).not.toContainText("Select an object");
});
