#!/usr/bin/env node
// Load budget (T-035, VN-PRF-004): the initial download (index.html and the scripts, module preloads and
// stylesheets it references) must stay under 1.5 MB gzip-compressed. Textures and spacecraft data load after
// the first frame and are not counted; the first ephemeris chunk joins the count once the loader exists (T-021).
//   node scripts/check-size.mjs [DIST]   (default dist/, after `npm run build`)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const BUDGET_BYTES = 1_500_000;

/** Repo-relative paths of index.html and what it loads before the first frame, sorted. */
export function initialFiles(dist) {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const refs = new Set(["index.html"]);
  for (const tag of html.match(/<(script|link)\b[^>]*>/g) ?? []) {
    const isLink = tag.startsWith("<link");
    if (isLink && !/rel="(stylesheet|modulepreload)"/.test(tag)) continue;
    const m = tag.match(isLink ? /href="([^"]+)"/ : /src="([^"]+)"/);
    if (!m) continue;
    const ref = m[1].replace(/^\.\//, "").replace(/^\/(vastness\/)?/, "");
    if (!/^[a-z]+:/i.test(ref)) refs.add(ref);
  }
  return [...refs].sort();
}

/** gzip (level 9) and raw size of each initial file, the total and whether it is within `budget`. */
export function measure(dist, budget = BUDGET_BYTES) {
  const files = initialFiles(dist).map((path) => {
    const data = readFileSync(join(dist, path));
    return { path, raw: data.length, gzip: gzipSync(data, { level: 9 }).length };
  });
  const total = files.reduce((s, f) => s + f.gzip, 0);
  return { files, total, budget, ok: total <= budget };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dist = process.argv[2] ?? "dist";
  const { files, total, budget, ok } = measure(dist);
  for (const f of files) console.log(`${String(f.gzip).padStart(9)} gz ${String(f.raw).padStart(9)} raw  ${f.path}`);
  console.log(`check-size: ${ok ? "ok" : "over budget"}: ${total} of ${budget} bytes compressed (VN-PRF-004)`);
  if (!ok) process.exit(1);
}
