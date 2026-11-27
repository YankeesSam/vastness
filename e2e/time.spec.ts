import { expect, test } from "@playwright/test";

// T-049, T-050 (VN-TIM-001..005): the time bar and the timeline in the real app.

test.describe("time control", () => {
  test("VN-TIM-001, VN-TIM-002, VN-TIM-005: pick a date, pause, step the rate, jump to an event", async ({ page }) => {
    await page.goto("./?t=2026-01-01T00:00:00Z");
    await expect(page.locator("canvas")).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    const bar = page.getByRole("contentinfo", { name: "Time" });

    await bar.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(bar).toContainText("Paused");
    const picker = bar.getByLabel("Date and time");
    await picker.fill("1989-08-25T04:00:00");
    await picker.press("Enter");
    await expect(bar.locator("time")).toHaveText("1989-08-25 04:00:00 UTC");

    await bar.getByRole("button", { name: "Play", exact: true }).click();
    await bar.getByRole("button", { name: "Faster", exact: true }).click();
    await bar.getByRole("button", { name: "Faster", exact: true }).click();
    await expect(bar).toContainText("1 h/s");
    await bar.getByRole("button", { name: "Reverse", exact: true }).click();
    await expect(bar).toContainText("−1 h/s");

    await page.getByRole("button", { name: "Voyager 2", exact: true }).click();
    await bar.getByRole("button", { name: "Pause", exact: true }).click();
    await bar.getByRole("button", { name: /Uranus flyby, 1986-01-24/ }).click();
    await expect(bar.locator("time")).toHaveText(/^1986-01-24 00:00:\d\d UTC$/);
    await page.screenshot({ path: test.info().outputPath("time-bar.png") });

    await bar.getByRole("button", { name: "Now", exact: true }).click();
    await expect(bar).toContainText("1 s/s");
    const year = String(new Date().getUTCFullYear());
    await expect(bar.locator("time")).toContainText(year);
  });
});
