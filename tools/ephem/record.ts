// Records the F1 fixtures (testdata/horizons): a handful of small Horizons responses, stored byte for byte, that
// the parser and pipeline tests read instead of the network (VN-DAT-007). Run by hand, rarely:
//   node --experimental-strip-types --no-warnings tools/ephem/record.ts
// Serial, at least 1 s apart, with the project User-Agent (VN-DAT-002). Existing fixtures are kept unless --force.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { queryUrl, vectorParams, type VectorQuery } from "./horizons.ts";

export const USER_AGENT = "vastness-ephemeris-pipeline (+https://github.com/YankeesSam/vastness)";

/** Fixture name -> query. Short spans keep each file to a few dozen lines. */
export const FIXTURES: Record<string, VectorQuery> = {
  "earth-2000-01": { command: "399", center: "500@10", start: "2000-01-01", stop: "2000-01-04", step: "1 d" },
  "moon-geocentric-2000-01": {
    command: "301",
    center: "500@399",
    start: "2000-01-01",
    stop: "2000-01-01 06:00",
    step: "60 m",
  },
  "voyager1-2000-01": { command: "-31", center: "500@10", start: "2000-01-01", stop: "2000-01-03", step: "1 d" },
  "error-unknown-id": { command: "9999999", center: "500@10", start: "2000-01-01", stop: "2000-01-02", step: "1 d" },
  "error-no-ephemeris": { command: "-31", center: "500@10", start: "1950-01-01", stop: "1950-01-02", step: "1 d" },
  "error-ambiguous": { command: "Mars", center: "500@10", start: "2000-01-01", stop: "2000-01-02", step: "1 d" },
};

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const dir = fileURLToPath(new URL("../../testdata/horizons/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  let last = 0;
  for (const [name, q] of Object.entries(FIXTURES)) {
    const file = join(dir, `${name}.json`);
    if (existsSync(file) && !force) continue;
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(queryUrl(vectorParams(q)), { headers: { "User-Agent": USER_AGENT } });
    const body = await res.text();
    writeFileSync(file, body);
    console.log(`${name}: HTTP ${res.status}, ${body.length} bytes`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
