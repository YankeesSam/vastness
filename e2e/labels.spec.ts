import { expect, test } from "@playwright/test";

// T-029 (VN-SCN-003): every body has a marker and a DOM label; overlapping labels declutter by priority.

const labels = async (page: import("@playwright/test").Page) =>
  ((await page.locator("canvas").getAttribute("data-labels")) ?? "").split(",").filter(Boolean);

test.describe("labels", () => {
  test("VN-SCN-003: Earth is labelled up close; from far out the Sun and planets are, and the Moon gives way to Earth", async ({
    page,
  }) => {
    await page.goto("./");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect.poll(() => labels(page)).toContain("Earth");
    await expect(page.getByTestId("labels").getByText("Earth", { exact: true })).toBeVisible();

    // Zoom out to about 3 AU from Earth: 2e4 km x 1.15^72.
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 7; i++) await page.mouse.wheel(0, 1000); // 70 steps: about 3.5e8 km
    await page.mouse.wheel(0, 200);
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-camera-distance")), { timeout: 5000 })
      .toBeGreaterThan(3e8);
    await expect.poll(() => labels(page)).toContain("Sun");
    const names = await labels(page);
    expect(names.length).toBeGreaterThanOrEqual(4);
    expect(names).toContain("Earth");
    expect(names).not.toContain("Moon"); // 384,000 km from Earth: well under a label's width from 4.5e8 km
    await page.screenshot({ path: test.info().outputPath("labels-far.png") });
  });
});
