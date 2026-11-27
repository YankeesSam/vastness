import { expect, test } from "@playwright/test";

// T-070 (VN-ACC-004, VN-GEN-011): without WebGL 2 the app shows a plain message and the object list with distances,
// and the object list, info panel and time control still work. WebGL is taken away before any script runs.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return (original as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof original;
  });
});

test("VN-ACC-004: no WebGL 2: a plain message, the objects with their distances, no canvas", async ({ page }) => {
  await page.goto("./?t=2026-01-01T00:00:00Z&still=1");
  await expect(page.getByRole("heading", { name: "The 3D view needs WebGL 2" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  const table = page.getByRole("table", { name: "Distances at the time shown" });
  // Earth at perihelion season: 147.1 million km from the Sun (Horizons: 0.98333 AU on 2026-01-01)
  const earth = table.getByRole("row", { name: /^Earth / });
  await expect(earth.getByRole("cell").first()).toHaveText(/^147,1\d\d,\d{3} km$/, { timeout: 15_000 });
  // the Moon is about 384,000 km from Earth
  await expect(
    table
      .getByRole("row", { name: /^Moon / })
      .getByRole("cell")
      .nth(1),
  ).toHaveText(/^3\d\d,\d{3} km$/);
  // spacecraft stream in too
  await expect(
    table
      .getByRole("row", { name: /^Voyager 1 / })
      .getByRole("cell")
      .first(),
  ).toHaveText(/ km$/, {
    timeout: 15_000,
  });
});

test("VN-ACC-004: no WebGL 2: choosing an object fills the info panel; the time control runs time", async ({
  page,
}) => {
  await page.goto("./?t=2026-01-01T00:00:00Z&still=1");
  const table = page.getByRole("table", { name: "Distances at the time shown" });
  await table.getByRole("button", { name: "Mars", exact: true }).click();
  const info = page.getByRole("region", { name: "Info" });
  await expect(info).toContainText("Mars");
  await expect(info).toContainText(/km/, { timeout: 15_000 });
  const time = page.locator("time").first();
  const before = await time.textContent();
  await page.getByRole("button", { name: /^Play/ }).click();
  await expect(time).not.toHaveText(before ?? "", { timeout: 5_000 });
});
