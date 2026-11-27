import { expect, test } from "@playwright/test";

// T-040 (VN-EPH-007, VN-CAT-006), T-041 (VN-CAT-004), T-042 (VN-CAT-003): spacecraft markers and trails from the
// generated ephemerides, the out-of-coverage reason, and the searchable object list.

test.describe("spacecraft", () => {
  test("VN-CAT-006, VN-CAT-004: at 2026 the heliocentric fleet has markers and trails", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("./?t=2026-01-01T00:00:00Z");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    // Voyager 1 and 2, New Horizons, Parker, Europa Clipper, JUICE, Lucy, Psyche, OSIRIS-APEX, JWST; and the
    // orbiters (T-089): Juno and CAPSTONE exact, LRO on its illustrative orbit before its stored window (T-090).
    await expect(canvas).toHaveAttribute("data-spacecraft", "13");
    await expect(canvas).toHaveAttribute("data-illustrative", "LRO", { timeout: 10_000 });
    await expect(canvas).toHaveAttribute("data-trails", "12", { timeout: 15_000 }); // no trail on an illustrative orbit
    expect(errors).toEqual([]);
  });

  test("VN-CAT-003: typing a name and Enter selects the spacecraft and flies to it", async ({ page }) => {
    await page.goto("./?t=2026-01-01T00:00:00Z");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    const search = page.getByRole("searchbox", { name: "Search objects" });
    await search.fill("webb");
    await expect(page.getByRole("region", { name: "Spacecraft" }).getByRole("button")).toHaveText([
      "James Webb Space Telescope",
    ]);
    await search.press("Enter");
    await expect(page.getByRole("heading", { name: "James Webb Space Telescope" })).toBeVisible();
    await expect(page.getByText("Distance from Earth")).toBeVisible();
  });

  test("VN-EPH-007: before launch the spacecraft is not drawn and the panel says why", async ({ page }) => {
    await page.goto("./?t=2000-01-01T00:00:00Z");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await expect(canvas).toHaveAttribute("data-spacecraft", "2"); // the Voyagers
    await page.getByRole("button", { name: "James Webb Space Telescope" }).click();
    await expect(page.getByTestId("no-position")).toHaveText(
      "James Webb Space Telescope has not launched yet at this time (launch 2021-12-25).",
    );
  });
});
