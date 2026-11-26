import { expect, test } from "@playwright/test";

// T-035 (VN-PRF-004): first render under 3 s on simulated fast 4G. The profile is Chrome DevTools' "Fast 4G"
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
  await expect(page.locator("canvas")).toHaveAttribute("data-scene-ready", "1", { timeout: 10_000 });
  const elapsed = Date.now() - start;
  test.info().annotations.push({ type: "first-render-ms", description: String(elapsed) });
  console.log(`first render on fast 4G: ${elapsed} ms`);
  expect(elapsed).toBeLessThan(FIRST_RENDER_MS);
});
