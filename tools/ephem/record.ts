// Records the F1 fixtures (testdata/horizons): a handful of small Horizons responses, stored byte for byte, that
// the parser and pipeline tests read instead of the network (VN-DAT-007). Run by hand, rarely:
//   node --experimental-strip-types --no-warnings tools/ephem/record.ts
// Through the polite client (serial, 1 s apart, cached in .cache/horizons). Existing fixtures are kept unless --force.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HorizonsClient } from "./client.ts";
import { vectorParams, type VectorQuery } from "./horizons.ts";

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
  const client = new HorizonsClient({
    cacheDir: fileURLToPath(new URL("../../.cache/horizons/", import.meta.url)),
    budget: 20,
  });
  for (const [name, q] of Object.entries(FIXTURES)) {
    const file = join(dir, `${name}.json`);
    if (existsSync(file) && !force) continue;
    const r = await client.get(vectorParams(q));
    writeFileSync(file, r.body);
    console.log(`${name}: ${r.fromCache ? "cache" : "fetched"}, ${r.body.length} bytes`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
