// T-100 (VN-EXT-006): fetches the CDAW SOHO/LASCO CME catalog (univ_all.txt, NASA GSFC CDAW Data Center) and writes
// the mass and kinetic energy of each DONKI CME it matches (rule in tools/cdaw/parse.ts) to
// public/spaceweather/cdaw.json. Run after tools/donki/build.ts:
//   node --experimental-strip-types --no-warnings tools/cdaw/build.ts [--offline]
// One request (5 MB of text), cached in .cache/cdaw.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DonkiFile } from "../../src/core/spaceweather/types.ts";
import { recordsJson } from "../net/json.ts";
import { PoliteClient } from "../net/polite.ts";
import { MATCH_RULE, matchCatalog, parseCatalog } from "./parse.ts";

export const CDAW_URL = "https://cdaw.gsfc.nasa.gov/CME_list/UNIVERSAL_ver2/text_ver/univ_all.txt";
export const CDAW_CREDIT =
  "CME mass and energy from the SOHO/LASCO CME catalog, generated and maintained at the CDAW Data Center by NASA and The Catholic University of America in cooperation with the Naval Research Laboratory; SOHO is a project of international cooperation between ESA and NASA";

async function main(): Promise<void> {
  const root = new URL("../../", import.meta.url);
  const path = (p: string): string => fileURLToPath(new URL(p, root));
  const client = new PoliteClient({
    cacheDir: path(".cache/cdaw"),
    name: "CDAW",
    offline: process.argv.includes("--offline"),
    budget: 1,
  });
  const res = await client.get(CDAW_URL);
  const { rows, updated } = parseCatalog(res.body);
  const donki = JSON.parse(readFileSync(path("public/spaceweather/donki.json"), "utf8")) as DonkiFile;
  const { matches, unmatched } = matchCatalog(donki.cmes, rows);
  const file = {
    source: CDAW_URL,
    credit: CDAW_CREDIT,
    retrieved: res.retrieved.slice(0, 10),
    catalogUpdated: updated,
    rule: MATCH_RULE,
    counts: {
      donki: donki.cmes.length,
      matched: matches.length,
      unmatched: unmatched.length,
      catalogRows: rows.length,
    },
    unmatched,
    matches,
  };
  mkdirSync(path("public/spaceweather"), { recursive: true });
  const out = recordsJson(file);
  writeFileSync(path("public/spaceweather/cdaw.json"), out);
  console.log(
    `cdaw: ${rows.length} catalog rows (updated ${updated}); ${matches.length} of ${donki.cmes.length} DONKI CMEs matched, ${unmatched.length} unmatched; ${out.length} bytes`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
