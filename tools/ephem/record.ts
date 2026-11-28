// Records the F1 fixtures (testdata/horizons): a handful of small Horizons responses, stored byte for byte, that
// the parser and pipeline tests read instead of the network (VN-DAT-007). Run by hand, rarely:
//   node --experimental-strip-types --no-warnings tools/ephem/record.ts
// Through the polite client (serial, 1 s apart, cached in .cache/horizons). Existing fixtures are kept unless --force.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HorizonsClient } from "./client.ts";
import { lookupParams } from "./check-ids.ts";
import { HORIZONS_LOOKUP_API, observerParams, vectorParams, type VectorQuery } from "./horizons.ts";

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

/**
 * Lookup API fixtures (VN-DAT-008), lookup-<sstr>.json: every ID in data/bodies.json, two spacecraft, and an ID
 * Horizons does not know.
 */
export const LOOKUP_FIXTURES = [
  "10",
  "199",
  "299",
  "301",
  "399",
  "499",
  "599",
  "699",
  "799",
  "899",
  // T-084 dwarf planets, T-107 comets (SPK IDs)
  "999",
  "1000012",
  "1000025",
  "1000036",
  "1000068",
  "1000093",
  "1000107",
  "1000132",
  "1003667",
  "1003913",
  "20000001",
  "20136108",
  "20136199",
  "20136472",
  "-31",
  "-170",
  "9999999",
];

/**
 * T-098 (VN-SCN-009): observer tables, rotation-<id>.json, for the rotation models: each body seen from the Sun's
 * centre (the Sun from Earth's) every 4 years over 2000-2028, plus 2026-11-27 hourly for 7 hours (the spin).
 */
export const ROTATION_FIXTURES: Record<string, VectorQuery> = Object.fromEntries(
  ["10", "199", "299", "399", "301", "499", "599", "699", "799", "899"].flatMap((id) => {
    const center = id === "10" ? "500@399" : "500@10";
    return [
      [`rotation-${id}`, { command: id, center, start: "2000-01-01", stop: "2028-01-02", step: "1461 d" }],
      [`rotation-${id}-spin`, { command: id, center, start: "2026-11-27", stop: "2026-11-27 07:00", step: "60 m" }],
    ];
  }),
);

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const dir = fileURLToPath(new URL("../../testdata/horizons/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const client = new HorizonsClient({
    cacheDir: fileURLToPath(new URL("../../.cache/horizons/", import.meta.url)),
    budget: 60,
  });
  for (const [name, q] of Object.entries(FIXTURES)) {
    const file = join(dir, `${name}.json`);
    if (existsSync(file) && !force) continue;
    const r = await client.get(vectorParams(q));
    writeFileSync(file, r.body);
    console.log(`${name}: ${r.fromCache ? "cache" : "fetched"}, ${r.body.length} bytes`);
  }
  for (const [name, q] of Object.entries(ROTATION_FIXTURES)) {
    const file = join(dir, `${name}.json`);
    if (existsSync(file) && !force) continue;
    const r = await client.get(observerParams(q));
    writeFileSync(file, r.body);
    console.log(`${name}: ${r.fromCache ? "cache" : "fetched"}, ${r.body.length} bytes`);
  }
  for (const sstr of LOOKUP_FIXTURES) {
    const file = join(dir, `lookup-${sstr}.json`);
    if (existsSync(file) && !force) continue;
    const r = await client.get(lookupParams(sstr), HORIZONS_LOOKUP_API);
    writeFileSync(file, r.body);
    console.log(`lookup ${sstr}: ${r.fromCache ? "cache" : "fetched"}, ${r.body.length} bytes`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
