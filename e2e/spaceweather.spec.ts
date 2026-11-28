import { expect, test } from "@playwright/test";

// T-101, T-102 (VN-EXT-005..007): the space weather layer. Off by default (its data is not even fetched); on, at the
// 2024-05-10 Gannon storm, CME shells fly, arrivals ring Earth, and the panel gives each value with its source.

const GANNON = "2024-05-10T12:00:00Z";

test("VN-EXT-005: off by default: no space weather drawn and no data fetched", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("spaceweather/")) asked.push(r.url());
  });
  await page.goto(`./?t=${GANNON}&still=1`);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  await expect(canvas).toHaveAttribute("data-space-weather", "");
  expect(asked).toEqual([]);
  await expect(page.getByRole("region", { name: "Space weather" })).toHaveCount(0);
});

test("VN-EXT-005, VN-EXT-006: the Gannon storm: CMEs in flight with mass from CDAW, arrivals at Earth", async ({
  page,
}) => {
  await page.goto(`./?t=${GANNON}&cam=10,4e8,0,60&still=1&layers=bodies,markers,spaceweather`);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  // cmes,flares,arrivals: several CMEs in flight and at least one arrival ring
  await expect(canvas).toHaveAttribute("data-space-weather", /^([3-9]|1\d|2[0-4]),\d+,[1-9]\d*$/, { timeout: 10_000 });
  const panel = page.getByTestId("space-weather");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("cme").first()).toContainText("km/s");
  await expect(panel).toContainText("CDAW");
  await expect(panel.getByTestId("arrivals")).toContainText("Earth");
  await expect(panel).toContainText("Solar wind at L1");
  // May 2024 is outside the day of SWPC measurements the build holds: the panel says so
  await expect(panel.getByTestId("no-wind")).toContainText("NOAA SWPC");
});

test("VN-EXT-005: the storm's measured shock and observed Kp 9 the next day", async ({ page }) => {
  await page.goto(`./?t=2024-05-11T01:00:00Z&still=1&layers=bodies,spaceweather`);
  await expect(page.locator("canvas")).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  await expect(page.getByTestId("storm")).toContainText("Kp 9");
});

test("VN-EXT-005: the layer switch turns it on and a link keeps it", async ({ page }) => {
  await page.goto(`./?t=${GANNON}&still=1`);
  await expect(page.locator("canvas")).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  await page.getByLabel(/Space weather/).check();
  await expect(page.getByTestId("space-weather")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/l=[a-z]*w/);
});

test("VN-EXT-009: up close, the Sun wears the nearest SDO image and the panel names its date", async ({ page }) => {
  await page.goto(`./?t=${GANNON}&cam=10,1.2e7,0,15&still=1&layers=bodies,spaceweather`);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  // the storm's eruption image, 2024-05-09 09:24 (data/sun.json)
  await expect(canvas).toHaveAttribute("data-sun-image", /^2024-05-09T09:2\d:\d\dZ$/, { timeout: 15_000 });
  await expect(page.getByTestId("sun-image")).toContainText("2024-05-09");
});

test("VN-EXT-009: from far away the image is not fetched", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/sun/")) asked.push(r.url());
  });
  await page.goto(`./?t=${GANNON}&cam=10,4e8,0,60&still=1&layers=bodies,spaceweather`);
  await expect(page.locator("canvas")).toHaveAttribute("data-space-weather", /^[1-9]/, { timeout: 20_000 });
  await expect(page.locator("canvas")).toHaveAttribute("data-sun-image", "");
  expect(asked).toEqual([]);
});
