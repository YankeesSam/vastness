import { expect, test } from "@playwright/test";

// T-032 (VN-CAT-005): clicking a marker selects its object, even when the object is far below a pixel.

test.describe("picking", () => {
  test("VN-CAT-005: click Earth's disc, then from 3 AU click Mars's marker; empty space clears", async ({ page }) => {
    await page.goto("./");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    const box = (await canvas.boundingBox())!;
    const object = (name: string) => page.getByRole("button", { name, exact: true });

    // Earth fills the middle of the view at the start.
    await page.mouse.click(box.x + box.width / 2 + 100, box.y + box.height / 2);
    await expect(object("Earth")).toHaveAttribute("aria-current", "true");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 7; i++) await page.mouse.wheel(0, 1000);
    await page.mouse.wheel(0, 200);
    const mars = page.getByTestId("labels").getByText("Mars", { exact: true });
    await expect(mars).toBeVisible();
    await page.waitForTimeout(200); // let the label settle after the last zoom frame
    const l = (await mars.boundingBox())!;
    // The label starts 8 px right of the marker, centred on it vertically; click 5 px off the marker itself.
    await page.mouse.click(l.x - 8 + 3, l.y + l.height / 2 + 4);
    await expect(object("Mars")).toHaveAttribute("aria-current", "true");
    const sub = Number(await canvas.getAttribute("data-camera-distance")) / 3389.5;
    expect(sub).toBeGreaterThan(1e5); // Mars is far below a pixel here

    await page.mouse.click(box.x + box.width - 60, box.y + box.height - 80); // clear of the bars and every marker
    await expect(object("Mars")).toHaveAttribute("aria-current", "false");
  });
});
