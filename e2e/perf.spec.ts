import { expect, test } from "@playwright/test";

// T-035 (VN-PRF-004): first render under 3 s on simulated fast 4G. T-046 (VN-UI-005): the first render is the frame
// with the Sun, planets and Moon (data-first-frame); spacecraft stream in after it under a quiet status line. The profile is Chrome DevTools' "Fast 4G"
// preset (9 Mbit/s down, 1.5 Mbit/s up, 60 ms, with DevTools' own adjustments: latency x2.75, throughput x0.9).
const FAST_4G = {
  offline: false,
  latency: 60 * 2.75,
  downloadThroughput: ((9 * 1000 * 1000) / 8) * 0.9,
  uploadThroughput: ((1.5 * 1000 * 1000) / 8) * 0.9,
};
const FIRST_RENDER_MS = 3000;

test("VN-PRF-004: first render under 3 s on simulated fast 4G with an empty cache", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", FAST_4G);

  const start = Date.now();
  await page.goto("./", { waitUntil: "commit" });
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-first-frame", "1", { timeout: 10_000 });
  const elapsed = Date.now() - start;
  test.info().annotations.push({ type: "first-render-ms", description: String(elapsed) });
  console.log(`first render on fast 4G: ${elapsed} ms`);
  expect(elapsed).toBeLessThan(FIRST_RENDER_MS);

  // VN-UI-005: the spacecraft arrive afterwards and the loading note clears; nothing blocks the view meanwhile.
  await expect(canvas).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
  console.log(`all objects on fast 4G: ${Date.now() - start} ms`);
  await expect(canvas).not.toHaveAttribute("data-spacecraft", "0");
  await expect(page.getByRole("status").filter({ hasText: "Loading trajectories" })).toHaveCount(0, {
    timeout: 20_000,
  });
});
