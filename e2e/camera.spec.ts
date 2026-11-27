import { expect, test } from "@playwright/test";

// T-030 (VN-CAM-001): wheel, keys and drags reach the camera; T-031 (VN-CAM-002, VN-CAM-003) adds fly-to and follow.

const distance = async (page: import("@playwright/test").Page) =>
  Number(await page.locator("canvas").getAttribute("data-camera-distance"));

test.describe("camera", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("canvas")).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  });

  test("VN-CAM-001: one wheel notch zooms by a fixed ratio, keys zoom and orbit, drag orbits", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const d0 = await distance(page);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => distance(page)).toBeCloseTo(d0 * 1.15, -1);
    await page.keyboard.press("+");
    await expect.poll(() => distance(page)).toBeCloseTo(d0, -1);

    const before = await canvas.screenshot();
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(canvas).toHaveAttribute("data-follow", "399"); // orbiting keeps following
    expect((await canvas.screenshot()).equals(before)).toBe(false);
  });

  test("VN-CAM-003: a pan releases follow", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = (await canvas.boundingBox())!;
    await expect(canvas).toHaveAttribute("data-follow", "399");
    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + 600, box.y + 400);
    await page.mouse.down();
    await page.mouse.move(box.x + 650, box.y + 420, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect(canvas).toHaveAttribute("data-follow", "");
  });
});
