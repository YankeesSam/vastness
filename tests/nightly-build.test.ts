import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// T-008: scripts/nightly-build.sh is run twice into separate folders. VASTNESS_NIGHTLY_FAST=1 skips npm ci,
// typecheck and the unit tests (this test is one of them) but still builds the app.
const root = fileURLToPath(new URL("../", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "vastness-nightly-"));
const outA = join(tmp, "a");
const outB = join(tmp, "b");
const sh = (cmd: string, args: string[], env: Record<string, string> = {}): string =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8", env: { ...process.env, ...env } });
const build = (out: string): string => sh("bash", ["scripts/nightly-build.sh", out], { VASTNESS_NIGHTLY_FAST: "1" });
const zipList = (zip: string): string[] =>
  sh("unzip", ["-Z1", zip])
    .split("\n")
    .filter((l) => l && !l.endsWith("/"));

let files: string[] = [];
let ver = "";

beforeAll(() => {
  build(outA);
  build(outB);
  files = readdirSync(outA).sort();
  ver = (JSON.parse(readFileSync(join(outA, "build.json"), "utf8")) as { version: string }).version;
}, 120_000);

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("nightly build (T-008)", () => {
  it("VN-DOC-005: publishes the web zip, docs zip, notices, build.json and SHA256SUMS", () => {
    expect(ver).toMatch(/-nightly$/);
    expect(files).toEqual(
      [
        "SHA256SUMS",
        "THIRD_PARTY_NOTICES.txt",
        "build.json",
        `vastness-${ver}-docs.zip`,
        `vastness-${ver}-web.zip`,
      ].sort(),
    );
  });

  it("VN-DOC-005: build.json names HEAD and its commit time, with sorted keys", () => {
    const text = readFileSync(join(outA, "build.json"), "utf8");
    const json = JSON.parse(text) as Record<string, string>;
    expect(Object.keys(json)).toEqual(["commit", "commit_time", "name", "version"]);
    expect(json.commit).toBe(sh("git", ["rev-parse", "--short=12", "HEAD"]).trim());
    expect(json.commit_time).toBe(sh("git", ["log", "-1", "--format=%cI", "HEAD"]).trim());
    expect(json.name).toBe("vastness");
  });

  it("VN-DOC-005: SHA256SUMS lists exactly the other files and matches them", () => {
    const sums = readFileSync(join(outA, "SHA256SUMS"), "utf8").trim().split("\n");
    expect(sums.map((l) => l.split(/\s+\*?/)[1]).sort()).toEqual(files.filter((f) => f !== "SHA256SUMS"));
    expect(() => execFileSync("sha256sum", ["--quiet", "-c", "SHA256SUMS"], { cwd: outA })).not.toThrow();
  });

  it("VN-GEN-007: the web zip carries the app, LICENSE, NOTICE, third-party notices and build.json", () => {
    const entries = zipList(join(outA, `vastness-${ver}-web.zip`));
    const dir = `vastness-${ver}-web/`;
    for (const f of ["index.html", "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.txt", "build.json"]) {
      expect(entries, f).toContain(dir + f);
    }
    expect(entries.some((e) => e.startsWith(`${dir}assets/`) && e.endsWith(".js"))).toBe(true);
    expect(entries).toEqual([...entries].sort());
  });

  it("VN-DOC-005: the docs zip carries README, LICENSE, NOTICE and docs/", () => {
    const entries = zipList(join(outA, `vastness-${ver}-docs.zip`));
    const dir = `vastness-${ver}-docs/`;
    for (const f of [
      "README.md",
      "LICENSE",
      "NOTICE",
      "build.json",
      "docs/REQUIREMENTS.md",
      "docs/adr/0001-stack.md",
    ]) {
      expect(entries, f).toContain(dir + f);
    }
  });

  it("VN-GEN-010: two builds of the same commit are byte-identical", () => {
    expect(readFileSync(join(outB, "SHA256SUMS"), "utf8")).toBe(readFileSync(join(outA, "SHA256SUMS"), "utf8"));
  });
});
