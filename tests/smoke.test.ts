import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), "utf8");

interface PackageJson {
  type?: string;
  private?: boolean;
  license?: string;
  engines?: { node?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
}

const pkg = JSON.parse(read("package.json")) as PackageJson;

describe("project skeleton (T-001)", () => {
  it("VN-GEN-001: the app is a static Vite build with no server code", () => {
    expect(pkg.type).toBe("module");
    expect(pkg.private).toBe(true);
    // A static build: `build` runs tsc and vite and nothing that starts a server.
    expect(pkg.scripts?.build).toMatch(/vite build/);
    // Runtime dependencies are browser libraries only (the full allowlist check is T-003, ADR-0001).
    const allowed = ["@react-three/fiber", "react", "react-dom", "three", "zustand"];
    for (const dep of Object.keys(pkg.dependencies ?? {})) expect(allowed, dep).toContain(dep);
    const html = read("index.html");
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('src="/src/main.tsx"');
    expect(existsSync(new URL("src/main.tsx", root))).toBe(true);
  });

  it("VN-GEN-001: the scripts the workflow relies on exist", () => {
    for (const script of ["dev", "build", "test", "typecheck", "e2e", "ephem", "format:check"]) {
      expect(pkg.scripts, script).toHaveProperty(script);
    }
  });

  it("toolchain: Node 20 floor, strict TypeScript, Apache-2.0 (VN-GEN-007)", () => {
    expect(pkg.engines?.node).toBe(">=20");
    expect(pkg.license).toBe("Apache-2.0");
    const tsconfig = JSON.parse(read("tsconfig.json")) as { compilerOptions: Record<string, unknown> };
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.noUncheckedIndexedAccess).toBe(true);
  });

  it("ignored outputs never reach git", () => {
    const ignored = read(".gitignore").split("\n");
    for (const entry of ["node_modules/", "dist/", ".cache/", "nightly/", "test-results/", "playwright-report/"]) {
      expect(ignored).toContain(entry);
    }
  });
});
