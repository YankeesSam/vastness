import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jpegSize, verify, type TextureManifest } from "../tools/textures/fetch";

// T-062 (VN-SCN-006, VN-DOC-002): the body textures in public/textures match data/textures.json byte for byte,
// stay within their size budget, and are credited in docs/DATA_SOURCES.md and the app's credits.

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("data/textures.json", root), "utf8")) as TextureManifest;
const entries = Object.entries(manifest.bodies);
/** Download budget: per texture and for all of them (they load only when a body is near, after the first frame). */
const MAX_BYTES = 1_100_000;
const MAX_TOTAL = 5_000_000;

describe("body textures", () => {
  it("VN-SCN-006: the planets (not the Sun) and the Moon each have a 2k equirectangular map", () => {
    expect(entries.map(([id]) => Number(id)).sort((a, b) => a - b)).toEqual([199, 299, 301, 399, 499, 599, 699, 799, 899]);
    for (const [, e] of entries) expect([e.width, e.height]).toEqual([2048, 1024]);
  });

  it("VN-DOC-002: every file in public/textures is in the manifest and matches it", () => {
    const files = readdirSync(new URL("public/textures/", root)).sort();
    expect(files).toEqual(entries.map(([, e]) => e.file).sort());
    for (const [, e] of entries) expect(verify(e, readFileSync(new URL(`public/textures/${e.file}`, root)))).toEqual([]);
  });

  it("VN-PRF-004: each texture is under 1.1 MB and all under 5 MB", () => {
    let total = 0;
    for (const [, e] of entries) {
      expect(e.bytes).toBeLessThanOrEqual(MAX_BYTES);
      total += e.bytes;
    }
    expect(total).toBeLessThanOrEqual(MAX_TOTAL);
  });

  it("verify catches a changed byte and reads JPEG sizes", () => {
    const [, e] = entries[0]!;
    const b = new Uint8Array(readFileSync(new URL(`public/textures/${e.file}`, root)));
    expect(jpegSize(b)).toEqual({ width: 2048, height: 1024 });
    b[b.length - 3] = b[b.length - 3]! ^ 1;
    expect(verify(e, b).join()).toMatch(/sha256/);
    expect(jpegSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("VN-DOC-002: the licence and credit are recorded where people read them", () => {
    expect(manifest.licence).toMatch(/^CC BY 4\.0/);
    const sources = readFileSync(new URL("docs/DATA_SOURCES.md", root), "utf8");
    expect(sources).toContain("Solar System Scope");
    expect(sources).toContain("public/textures");
    expect(sources).toContain(manifest.credit);
  });
});
