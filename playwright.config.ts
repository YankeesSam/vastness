import { defineConfig, devices } from "@playwright/test";

// F4 (docs/TESTBED.md): headless Chromium rendering WebGL through SwiftShader, DPR 1, a fixed viewport, against
// the production build served by `vite preview` (T-005).
const port = 4173;

const browser = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
};
const TIMED = /(perf|camera)\.spec\.ts/;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Each SwiftShader instance renders on several CPU threads; since the surface textures (T-062) more than 4 at once
  // saturate a 16-core machine and specs time out waiting. CI keeps the default, half its cores.
  workers: process.env.CI ? "50%" : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    trace: "retain-on-failure",
  },
  // Specs that time wall-clock budgets (first render, fly-to) run after the rest, one at a time: SwiftShader renders
  // on the CPU, so parallel specs would be measuring each other.
  projects: [
    {
      name: "chromium",
      use: browser,
      testIgnore: TIMED,
    },
    {
      name: "timed",
      use: browser,
      testMatch: TIMED,
      dependencies: ["chromium"],
      fullyParallel: false,
      workers: 1,
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
