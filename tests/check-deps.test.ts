import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script without type declarations
import * as deps from "../scripts/check-deps.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

interface Pkg {
  name: string;
  version: string;
  license: string;
  text: string;
}

const api = deps as {
  allowlistFromAdr: (adr: string) => string[];
  disallowed: (dependencies: Record<string, string>, allowlist: string[]) => string[];
  runtimePackages: (lock: unknown) => { name: string; version: string; license?: string }[];
  badLicences: (packages: { name: string; license?: string }[]) => string[];
  renderNotices: (packages: Pkg[]) => string;
};

describe("runtime dependency check (T-003)", () => {
  it("VN-GEN-005: the allowlist is read from ADR-0001", () => {
    expect(api.allowlistFromAdr(read("docs/adr/0001-stack.md"))).toEqual([
      "@react-three/fiber",
      "react",
      "react-dom",
      "three",
      "zustand",
    ]);
  });

  it("VN-GEN-005: any dependency outside the allowlist is reported", () => {
    const allow = ["react", "react-dom"];
    expect(api.disallowed({ react: "^19", "react-dom": "^19" }, allow)).toEqual([]);
    expect(api.disallowed({ react: "^19", lodash: "^4", axios: "^1" }, allow)).toEqual(["axios", "lodash"]);
  });

  it("VN-GEN-005: runtime packages are the lock file's non-dev entries, nested ones included", () => {
    const lock = {
      packages: {
        "": { name: "vastness" },
        "node_modules/react": { version: "19.0.0", license: "MIT" },
        "node_modules/vite": { version: "7.0.0", license: "MIT", dev: true },
        "node_modules/a/node_modules/b": { version: "1.0.0", license: "ISC" },
        "node_modules/fsevents": { version: "2.0.0", license: "MIT", devOptional: true },
      },
    };
    expect(api.runtimePackages(lock)).toEqual([
      { name: "b", version: "1.0.0", license: "ISC" },
      { name: "react", version: "19.0.0", license: "MIT" },
    ]);
  });

  it("VN-GEN-005, VN-GEN-007: copyleft, missing or unknown licences fail", () => {
    expect(
      api.badLicences([
        { name: "a", license: "MIT" },
        { name: "b", license: "Apache-2.0" },
      ]),
    ).toEqual([]);
    expect(
      api.badLicences([
        { name: "g", license: "GPL-3.0" },
        { name: "n" },
        { name: "o", license: "(MIT OR Apache-2.0)" },
      ]),
    ).toEqual(["g: GPL-3.0", "n: (none)"]);
  });

  it("VN-GEN-007: notices are sorted, deterministic and carry each licence text", () => {
    const a = { name: "zed", version: "1.0.0", license: "MIT", text: "Copyright Zed\r\n" };
    const b = { name: "alpha", version: "2.0.0", license: "ISC", text: "Copyright Alpha" };
    const out = api.renderNotices([a, b]);
    expect(out).toBe(api.renderNotices([b, a]));
    expect(out.indexOf("alpha 2.0.0")).toBeLessThan(out.indexOf("zed 1.0.0"));
    expect(out).toContain("Copyright Zed\n");
    expect(out).not.toContain("\r");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("VN-GEN-005, VN-GEN-007: the real tree passes and THIRD_PARTY_NOTICES.txt is current", () => {
    const out = execFileSync("node", ["scripts/check-deps.mjs"], { cwd: root, encoding: "utf8" });
    expect(out).toMatch(/react@\S+ MIT/);
    expect(out).toMatch(/scheduler@\S+ MIT/);
    const notices = read("THIRD_PARTY_NOTICES.txt");
    expect(notices).toContain("react 19.");
    expect(notices).toContain("scheduler ");
  });

  it("VN-GEN-007: the build copies THIRD_PARTY_NOTICES.txt into the bundle", () => {
    expect(read("vite.config.ts")).toContain("THIRD_PARTY_NOTICES.txt");
  });
});
