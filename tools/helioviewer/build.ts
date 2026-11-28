// T-104 (VN-EXT-009): fetches the Sun images chosen by tools/helioviewer/select.ts from Helioviewer (SDO/AIA 171,
// 256 px PNG) into public/sun and writes data/sun.json (dates, image times, disk fraction, SHA-256). Run after
// tools/donki/build.ts:
//   node --experimental-strip-types --no-warnings tools/helioviewer/build.ts [--offline] [--check]
// --check verifies the files against data/sun.json with no network. Two requests per image, 1 s apart, cached.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DonkiFile } from "../../src/core/spaceweather/types.ts";
import { PoliteClient } from "../net/polite.ts";
import { stableStringify } from "../ephem/main.ts";
import {
  closestUrl,
  fileName,
  IMAGE_SCALE,
  LAYER,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_BYTES,
  readClosest,
  screenshotUrl,
  selectDates,
  SIZE_PX,
  verifyImage,
  type SunImage,
  type SunManifest,
} from "./select.ts";

export const SUN_CREDIT =
  "Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams; Sun images rendered by Helioviewer.org (The Helioviewer Project)";

async function main(): Promise<void> {
  const path = (p: string): string => fileURLToPath(new URL(`../../${p}`, import.meta.url));
  if (process.argv.includes("--check")) {
    const m = JSON.parse(readFileSync(path("data/sun.json"), "utf8")) as SunManifest;
    const problems = m.images.flatMap((e) => verifyImage(e, readFileSync(path(`public/sun/${e.file}`))));
    for (const p of problems) console.error(p);
    console.log(`sun: ${m.images.length} images, ${problems.length} problems`);
    if (problems.length) process.exit(1);
    return;
  }
  const donki = JSON.parse(readFileSync(path("public/spaceweather/donki.json"), "utf8")) as DonkiFile;
  const wanted = selectDates(donki, donki.span.end);
  // Helioviewer can be slow to render; give each request time, keep the budget to two per image
  const client = new PoliteClient({
    cacheDir: path(".cache/helioviewer"),
    name: "Helioviewer",
    offline: process.argv.includes("--offline"),
    budget: 2 * wanted.length + 2,
    timeoutMs: 180_000,
  });
  mkdirSync(path("public/sun"), { recursive: true });
  const images: SunImage[] = [];
  const retrieved: string[] = [];
  for (const w of wanted) {
    const closest = await client.get(closestUrl(w.date));
    const { imageDate, diskFraction } = readClosest(closest.body);
    const res = await client.get(screenshotUrl(w.date), {}, true);
    const shot = { bytes: new Uint8Array(Buffer.from(res.body, "base64")) };
    retrieved.push(res.retrieved.slice(0, 10));
    if (shot.bytes.length > MAX_IMAGE_BYTES)
      throw new Error(`${w.date}: ${shot.bytes.length} bytes, over ${MAX_IMAGE_BYTES}`);
    const file = fileName(w.date);
    writeFileSync(path(`public/sun/${file}`), shot.bytes);
    images.push({
      file,
      requested: w.date,
      imageDate,
      why: w.why,
      diskFraction,
      sha256: createHash("sha256").update(shot.bytes).digest("hex"),
      bytes: shot.bytes.length,
    });
    process.stdout.write(`\r${images.length}/${wanted.length} ${w.date}`);
  }
  const keep = new Set(images.map((i) => i.file));
  for (const f of readdirSync(path("public/sun"))) if (!keep.has(f)) rmSync(path(`public/sun/${f}`));
  const total = images.reduce((s, i) => s + i.bytes, 0);
  if (total > MAX_TOTAL_BYTES) throw new Error(`total ${total} bytes, over ${MAX_TOTAL_BYTES}`);
  const manifest: SunManifest = {
    source: "https://api.helioviewer.org/v2 (takeScreenshot, getClosestImage)",
    credit: SUN_CREDIT,
    retrieved: retrieved.sort().at(-1) ?? "",
    layer: `${LAYER} (SDO AIA 171 Angstrom)`,
    sizePx: SIZE_PX,
    imageScale: IMAGE_SCALE,
    images,
  };
  writeFileSync(path("data/sun.json"), stableStringify(manifest));
  console.log(
    `\nsun: ${images.length} images, ${total} bytes; ${client.requests} requests, ${client.cacheHits} cached`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
