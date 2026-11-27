import { expect, test } from "@playwright/test";

// T-052 (VN-WEB-002, VN-UI-002): Share copies a link; opening it in a new tab restores the view.

test.describe("share", () => {
  test("VN-WEB-002: the copied link reopens time, rate, selection, camera and layers", async ({ context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const requests: string[] = [];
    context.on("request", (r) => requests.push(r.url()));

    await page.goto("./");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    const bar = page.getByRole("contentinfo", { name: "Time" });
    await bar.getByRole("button", { name: "Pause", exact: true }).click();
    const picker = bar.getByLabel("Date and time");
    await picker.fill("2015-07-14T11:00:00");
    await picker.press("Enter");
    await bar.getByRole("button", { name: "Faster", exact: true }).click();
    await page.getByRole("button", { name: "New Horizons", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-follow", "-98", { timeout: 10_000 });
    const distance = await canvas.getAttribute("data-camera-distance");

    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/#v=1&t=2015-07-14T11:00:00\.000Z&r=60&p=1&s=-98&c=-98,/);
    expect(new URL(link).search).toBe("");

    const other = await context.newPage();
    await other.goto(link);
    const c2 = other.locator("canvas");
    await expect(c2).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    const bar2 = other.getByRole("contentinfo", { name: "Time" });
    await expect(bar2.locator("time")).toHaveText("2015-07-14 11:00:00 UTC");
    await expect(bar2).toContainText("Paused");
    await expect(bar2.getByRole("combobox", { name: "Rate" })).toHaveValue("1"); // 1 min/s
    await expect(
      other.getByRole("region", { name: "Info" }).getByRole("heading", { name: "New Horizons" }),
    ).toBeVisible();
    await expect(c2).toHaveAttribute("data-follow", "-98");
    await expect(c2).toHaveAttribute("data-camera-distance", distance!);
    // VN-WEB-002: the fragment is never sent to a server
    expect(requests.some((u) => u.includes("#") || u.includes("v=1"))).toBe(false);
  });
});
