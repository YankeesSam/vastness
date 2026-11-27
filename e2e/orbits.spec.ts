import { expect, test } from "@playwright/test";

// T-028 (VN-SCN-002): orbit paths for the eight planets and the Moon, sampled over one period.

test.describe("orbits", () => {
  test("VN-SCN-002: all nine orbits are drawn in full; from 40 AU out the planets' paths show", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("./");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-orbits", "9", { timeout: 10_000 });

    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 9; i++) await page.mouse.wheel(0, 1000); // 90 steps: about 6e9 km, 40 AU
    await expect.poll(async () => Number(await canvas.getAttribute("data-camera-distance"))).toBeGreaterThan(5e9);
    await page.screenshot({ path: test.info().outputPath("orbits-far.png") });
    expect(errors).toEqual([]);
  });
});
