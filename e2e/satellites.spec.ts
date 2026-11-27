import { expect, test } from "@playwright/test";

// T-094 (VN-CAT-007): the Earth satellite layer: SGP4 from the build's GP elements, markers and labels near Earth
// only, the element epoch and its age in the panel, and an illustrative orbit beyond 14 days from the epoch.

test.describe("Earth satellites", () => {
  test("VN-CAT-007: near Earth at the element epoch the satellites are drawn exactly and the panel shows the epoch", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("./?t=2026-11-27T00:00:00Z&cam=399,60000,30,25");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-satellites", "13");
    // Some are behind Earth or give way to higher-priority labels; geostationary ones are always in view here.
    await expect(canvas).toHaveAttribute("data-labels", /GOES-1[89]/);
    await expect(canvas).not.toHaveAttribute("data-illustrative", /International Space Station|GOES/);
    const search = page.getByRole("searchbox", { name: "Search objects" });
    await search.fill("iss");
    await expect(page.getByRole("region", { name: "Earth satellites" }).getByRole("button")).toHaveText([
      "International Space Station",
    ]);
    await search.press("Enter");
    await expect(page.getByRole("heading", { name: "International Space Station" })).toBeVisible();
    await expect(page.getByText("Earth satellite", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Orbital elements")).toContainText("2026-11-26 22:39 UTC, 1 h before the time shown");
    await expect(page.getByText("Distance from Earth")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("VN-CAT-007: from far out no satellite is labelled", async ({ page }) => {
    await page.goto("./?t=2026-11-27T00:00:00Z&cam=10,6e8,0,35");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-labels", /Earth/);
    await expect(canvas).not.toHaveAttribute("data-labels", /Hubble|Starlink|GOES|International Space Station/);
  });

  test("VN-CAT-007, VN-EPH-011: beyond 14 days from the elements a satellite is on a labelled illustrative orbit", async ({
    page,
  }) => {
    await page.goto("./?t=2027-02-01T00:00:00Z&cam=399,60000,30,25");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-illustrative", /International Space Station/);
    await page.getByRole("searchbox", { name: "Search objects" }).fill("hubble");
    await page.getByRole("searchbox", { name: "Search objects" }).press("Enter");
    await expect(page.getByTestId("no-position")).toContainText(
      "more than 14 days from Hubble Space Telescope's orbital elements (epoch 2026-11-26)",
    );
    await expect(page.getByTestId("no-position")).toContainText("illustrative orbit");
  });
});
