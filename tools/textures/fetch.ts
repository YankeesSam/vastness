// T-062 (VN-SCN-006, VN-DOC-002): fetches the body textures listed in data/textures.json into public/textures,
// serially and 1 s apart, and checks each against its recorded SHA-256 and size. Run by hand, rarely:
//   node --experimental-strip-types --no-warnings tools/textures/fetch.ts [--check]
// --check only verifies the files already there (no network). Solar System Scope serves a file only with its
// textures page as the referrer.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface TextureEntry {
  file: string;
  url: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
}

export interface TextureManifest {
  source: string;
  licence: string;
  credit: string;
  retrieved: string;
  projection: string;
  bodies: Record<string, TextureEntry>;
}

const REFERER = "https://www.solarsystemscope.com/textures/";
const USER_AGENT = "vastness-texture-fetch (+https://github.com/YankeesSam/vastness)";

/** The width and height in a JPEG's first start-of-frame marker, or null. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]! };
    i += 2 + len;
  }
  return null;
}

/** Problems with one file's bytes against its entry; empty when it matches. */
export function verify(e: TextureEntry, b: Uint8Array): string[] {
  const out: string[] = [];
  const sha = createHash("sha256").update(b).digest("hex");
  if (sha !== e.sha256) out.push(`${e.file}: sha256 ${sha}, expected ${e.sha256}`);
  if (b.length !== e.bytes) out.push(`${e.file}: ${b.length} bytes, expected ${e.bytes}`);
  const size = jpegSize(b);
  if (!size || size.width !== e.width || size.height !== e.height)
    out.push(`${e.file}: ${size ? `${size.width}x${size.height}` : "not a JPEG"}, expected ${e.width}x${e.height}`);
  return out;
}

async function main(): Promise<void> {
  const root = new URL("../../", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("data/textures.json", root), "utf8")) as TextureManifest;
  const check = process.argv.includes("--check");
  const problems: string[] = [];
  for (const e of Object.values(manifest.bodies)) {
    const path = fileURLToPath(new URL(`public/textures/${e.file}`, root));
    if (!existsSync(path) || verify(e, readFileSync(path)).length > 0) {
      if (check) {
        problems.push(...(existsSync(path) ? verify(e, readFileSync(path)) : [`${e.file}: missing`]));
        continue;
      }
      await new Promise((r) => setTimeout(r, 1000));
      const res = await fetch(e.url, { headers: { Referer: REFERER, "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`${e.url}: HTTP ${res.status}`);
      const b = new Uint8Array(await res.arrayBuffer());
      const p = verify(e, b);
      if (p.length > 0) throw new Error(p.join("\n"));
      writeFileSync(path, b);
      console.log(`${e.file}: fetched, ${b.length} bytes`);
    }
  }
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`textures: ${Object.keys(manifest.bodies).length} ok`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
