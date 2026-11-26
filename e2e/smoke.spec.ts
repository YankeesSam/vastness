import { expect, test } from "@playwright/test";

// T-005 smoke (F4): the shell renders over a live WebGL2 canvas, nothing is requested from another origin, and
// the About box names the commit the build was made from.

test.describe("smoke", () => {
  test("VN-UI-001, VN-GEN-002: shell over a WebGL2 canvas, no request leaves the origin", async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? "").origin;
    const foreign: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.protocol === "data:" || url.protocol === "blob:") return;
      if (url.origin !== origin) foreign.push(req.url()); // VN-GEN-002
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("./");
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Side panel" })).toBeVisible();
    await expect(page.getByRole("contentinfo", { name: "Time" })).toContainText("UTC");

    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    const webgl2 = await canvas.evaluate(
      (c: HTMLCanvasElement) => c.getContext("webgl2") instanceof WebGL2RenderingContext,
    );
    expect(webgl2).toBe(true);
    const box = await canvas.boundingBox();
    expect(box?.width).toBe(1280);
    expect(box?.height).toBe(800);

    await page.waitForLoadState("networkidle");
    expect(foreign).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("VN-GEN-006: About shows the commit named in build.json", async ({ page, request }) => {
    const build = (await (await request.get("build.json")).json()) as { commit: string; version: string };
    expect(build.commit).toMatch(/^[0-9a-f]{12}$/);
    await page.goto("./");
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("menuitem", { name: "About Vastness" }).click();
    const about = page.getByRole("dialog", { name: "About Vastness" });
    await expect(about).toContainText(build.commit);
    await expect(about).toContainText(build.version);
    for (const file of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.txt"]) {
      expect((await request.get(file)).status()).toBe(200);
    }
  });
});
