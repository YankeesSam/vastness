// T-102 (VN-EXT-007): fetches NOAA SWPC's real-time solar wind at L1 (plasma and magnetic field, 1-minute, the last
// day SWPC serves) and the planetary Kp index (the last week) and writes hourly means to public/spaceweather/swpc.json:
//   node --experimental-strip-types --no-warnings tools/swpc/build.ts [--offline] [--refresh]
// Three requests, cached in .cache/swpc; --refresh takes a new day (SWPC's files roll, so the cache pins a build).

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { recordsJson } from "../net/json.ts";
import { PoliteClient } from "../net/polite.ts";
import { buildSolarWind } from "./parse.ts";

export const SWPC = "https://services.swpc.noaa.gov";
export const SWPC_URLS = {
  wind: `${SWPC}/json/rtsw/rtsw_wind_1m.json`,
  mag: `${SWPC}/json/rtsw/rtsw_mag_1m.json`,
  kp: `${SWPC}/products/noaa-planetary-k-index.json`,
};
export const SWPC_CREDIT = "Solar wind and Kp from NOAA Space Weather Prediction Center (SWPC)";

async function main(): Promise<void> {
  const path = (p: string): string => fileURLToPath(new URL(`../../${p}`, import.meta.url));
  const client = new PoliteClient({
    cacheDir: path(".cache/swpc"),
    name: "SWPC",
    offline: process.argv.includes("--offline"),
    refresh: process.argv.includes("--refresh"),
    budget: 3,
  });
  const wind = await client.get(SWPC_URLS.wind);
  const mag = await client.get(SWPC_URLS.mag);
  const kp = await client.get(SWPC_URLS.kp);
  const file = buildSolarWind(
    { wind: JSON.parse(wind.body), mag: JSON.parse(mag.body), kp: JSON.parse(kp.body) },
    {
      retrieved: [wind, mag, kp]
        .map((r) => r.retrieved.slice(0, 10))
        .sort()
        .at(-1)!,
      source: `${SWPC_URLS.wind}, ${SWPC_URLS.mag}, ${SWPC_URLS.kp}`,
      credit: SWPC_CREDIT,
    },
  );
  mkdirSync(path("public/spaceweather"), { recursive: true });
  const out = recordsJson(file as unknown as Record<string, unknown>);
  writeFileSync(path("public/spaceweather/swpc.json"), out);
  console.log(
    `swpc: ${file.hours.length} hours ${file.span.start}..${file.span.end}, ${file.kp.length} Kp; ${out.length} bytes`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
