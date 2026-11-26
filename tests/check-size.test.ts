import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without types
import { BUDGET_BYTES, initialFiles, measure } from "../scripts/check-size.mjs";

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "vastness-size-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(
    join(dir, "index.html"),
    '<script type="module" crossorigin src="./assets/a.js"></script>' +
      '<link rel="modulepreload" href="/vastness/assets/b.js"><link rel="stylesheet" href="./assets/c.css">' +
      '<link rel="icon" href="./favicon.ico">',
  );
  writeFileSync(join(dir, "assets/a.js"), "x".repeat(10_000));
  writeFileSync(join(dir, "assets/b.js"), "y".repeat(10_000));
  writeFileSync(join(dir, "assets/c.css"), "z".repeat(10_000));
  writeFileSync(join(dir, "assets/late.js"), "w".repeat(10_000)); // not referenced: loads after the first frame
  return dir;
}

describe("check-size (T-035)", () => {
  it("VN-PRF-004: the budget is 1.5 MB compressed", () => {
    expect(BUDGET_BYTES).toBe(1_500_000);
  });

  it("VN-PRF-004: the initial download is index.html plus its scripts, preloads and stylesheets", () => {
    const dir = fixture();
    expect(initialFiles(dir)).toEqual(["assets/a.js", "assets/b.js", "assets/c.css", "index.html"]);
  });

  it("VN-PRF-004: sizes are gzip sizes and their total is compared with the budget", () => {
    const dir = fixture();
    const { files, total, ok } = measure(dir);
    expect(files.map((f: { path: string }) => f.path)).toEqual([
      "assets/a.js",
      "assets/b.js",
      "assets/c.css",
      "index.html",
    ]);
    for (const f of files) expect(f.gzip).toBeLessThan(f.raw);
    expect(total).toBe(files.reduce((s: number, f: { gzip: number }) => s + f.gzip, 0));
    expect(ok).toBe(true);
    expect(measure(dir, 10).ok).toBe(false);
  });
});
