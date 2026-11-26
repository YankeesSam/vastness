import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("CI workflow (T-006)", () => {
  const ci = read(".github/workflows/ci.yml");

  it("VN-WEB-001: runs on main and pull requests, cancels superseded runs, caches npm", () => {
    expect(ci).toMatch(/push:\s+branches: \[main\]/);
    expect(ci).toContain("pull_request:");
    expect(ci).toContain("cancel-in-progress: true");
    expect(ci).toContain("cache: npm");
    expect(ci).toContain("node-version: 22");
  });

  it("VN-WEB-001: runs every local check in order, then e2e in Playwright Chromium", () => {
    const steps = [
      "npm ci",
      "npm run check-deps",
      "npm run typecheck",
      "npm run format:check",
      "npm test",
      "npm run build",
      "npm run check-size",
      "npx playwright install --with-deps chromium",
      "npm run e2e",
    ];
    const at = steps.map((s) => ci.indexOf(`run: ${s}`));
    for (const [i, s] of steps.entries()) expect(at[i], s).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("VN-WEB-001: README shows the CI badge for main", () => {
    expect(read("README.md")).toContain(
      "https://github.com/YankeesSam/vastness/actions/workflows/ci.yml/badge.svg?branch=main",
    );
  });
});
