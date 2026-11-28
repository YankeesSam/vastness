import { expect, test } from "@playwright/test";

// T-067 (VN-ACC-001): every action reachable from the keyboard; the shortcuts listed in a help dialog.

test.describe("keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("canvas")).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  });

  test("VN-ACC-001: search, fly, follow, release, play/pause and help without a mouse", async ({ page }) => {
    const canvas = page.locator("canvas");
    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox", { name: "Search objects" })).toBeFocused();
    await page.keyboard.type("Mars");
    await page.keyboard.press("Enter");
    await expect(canvas).toHaveAttribute("data-follow", "499", { timeout: 6000 });
    // VN-ACC-002: the arrival is announced politely; the view has a text alternative
    const region = page.getByRole("status", { name: "Announcements" });
    await expect(region).toHaveText("Arrived at Mars, following it.", { timeout: 3000 });
    await expect(page.getByRole("img", { name: /following Mars/ })).toHaveCount(1);

    await page.getByRole("searchbox", { name: "Search objects" }).blur();
    await page.keyboard.press("Escape");
    await expect(canvas).toHaveAttribute("data-follow", "");
    await page.keyboard.press("f");
    await expect(canvas).toHaveAttribute("data-follow", "499", { timeout: 6000 });

    const playButton = page.getByRole("group", { name: "Playback" }).getByRole("button", { name: /^(Play|Pause)$/ });
    const label = await playButton.getAttribute("aria-label");
    await page.keyboard.press("Space");
    await expect(playButton).not.toHaveAttribute("aria-label", label!);

    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(canvas).toHaveAttribute("data-follow", "499"); // Escape closed the dialog only
  });

  test("VN-ACC-001: Tab reaches the top bar, side panel and time bar", async ({ page }) => {
    const seen = new Set<string>();
    // 160: the side panel lists every object (comets and dwarf planets since T-107, T-084)
    for (let i = 0; i < 160; i++) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a) return "";
        if (a.closest("header")) return "top";
        if (a.closest("aside")) return "side";
        if (a.closest("footer")) return "time";
        return "";
      });
      if (where) seen.add(where);
      if (seen.size === 3) break;
    }
    expect([...seen].sort()).toEqual(["side", "time", "top"]);
  });
});
