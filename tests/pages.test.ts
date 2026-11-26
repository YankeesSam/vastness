import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("GitHub Pages deploy (T-007)", () => {
  it("VN-WEB-001: deploys main only after CI passed, or on demand", () => {
    const wf = read(".github/workflows/pages.yml");
    expect(wf).toMatch(/workflow_run:\s+workflows: \[CI\]\s+types: \[completed\]\s+branches: \[main\]/);
    expect(wf).toContain("workflow_dispatch:");
    expect(wf).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(wf).toContain("ref: ${{ github.event.workflow_run.head_sha || github.sha }}");
  });

  it("VN-WEB-001: builds with the /vastness/ base and publishes dist through the Pages actions", () => {
    const wf = read(".github/workflows/pages.yml");
    expect(wf).toContain("VASTNESS_BASE: /vastness/");
    expect(wf).toContain("run: npm run build");
    expect(wf).toMatch(/uses: actions\/upload-pages-artifact@v\d+\s+with:\s+path: dist/);
    expect(wf).toMatch(/uses: actions\/deploy-pages@v\d+/);
    expect(wf).toMatch(/pages: write/);
    expect(wf).toMatch(/id-token: write/);
    expect(wf).toContain("fetch-depth: 0"); // tags for the version in build.json (VN-GEN-006)
  });

  it("VN-WEB-001: vite base is relative by default (LAN, nightly zip) and /vastness/ from VASTNESS_BASE", () => {
    const cfg = read("vite.config.ts");
    expect(cfg).toContain('base: process.env.VASTNESS_BASE || "./"');
  });

  it("VN-WEB-001: check-pages.sh exists, is executable and parses", () => {
    const script = new URL("../scripts/check-pages.sh", import.meta.url);
    expect(existsSync(script)).toBe(true);
    execFileSync("bash", ["-n", script.pathname]);
    execFileSync("test", ["-x", script.pathname]);
    const text = read("scripts/check-pages.sh");
    expect(text).toContain("https://yankeessam.github.io/vastness/");
    expect(text).toContain("build.json");
  });
});
