// VN-DAT-008: `npm run ephem:check-ids`. Every object ID we hand to Horizons (data/bodies.json, and data/catalog.json
// once it exists) is looked up by ID in the Horizons lookup API and must come back as the object we think it is:
// an entry with that SPK ID whose name or an alias matches ours. Any mismatch, unknown ID or bad response fails the
// run with the query quoted. Through the polite client (serial, cached); tests use recorded responses.
//
//   npm run ephem:check-ids [-- --offline]

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HorizonsClient } from "./client.ts";
import { HORIZONS_LOOKUP_API } from "./horizons.ts";
import type { BodiesFile, Fetcher } from "./main.ts";

export interface IdClaim {
  id: number;
  /** Our name for the object. */
  name: string;
  /** Horizons' name where it differs from ours beyond case and a "(spacecraft)" suffix. */
  horizonsName?: string;
  /** Where the claim comes from, for the report (data/bodies.json, data/catalog.json). */
  source: string;
}

export interface LookupEntry {
  name: string;
  spkid: string;
  type: string;
  alias: string[];
  pdes: string | null;
}

export interface IdCheck {
  claim: IdClaim;
  pass: boolean;
  /** Horizons' name for the ID, when it knows the ID. */
  found: string;
  note: string;
  query: string;
}

export function lookupParams(sstr: string): Record<string, string> {
  return { format: "json", sstr };
}

/** Parses a lookup response; throws with the query on anything that is not the documented JSON. */
export function parseLookup(body: string, query: string): LookupEntry[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`lookup response is not JSON (query: ${query})`);
  }
  const o = json as { count?: unknown; result?: unknown; error?: unknown; signature?: { source?: unknown } };
  if (o.error !== undefined) throw new Error(`lookup error: ${String(o.error)} (query: ${query})`);
  if (o.signature?.source !== "NASA/JPL Horizons Lookup API") {
    throw new Error(`not a Horizons lookup response (query: ${query})`);
  }
  const count = Number(o.count);
  if (!Number.isInteger(count) || count < 0) throw new Error(`lookup count ${String(o.count)} (query: ${query})`);
  if (count === 0) return [];
  if (!Array.isArray(o.result) || o.result.length !== count) {
    throw new Error(
      `lookup lists ${Array.isArray(o.result) ? o.result.length : "no"} results for count ${count} (query: ${query})`,
    );
  }
  return o.result.map((r: Record<string, unknown>) => ({
    name: String(r.name),
    spkid: String(r.spkid),
    type: String(r.type),
    alias: Array.isArray(r.alias) ? r.alias.map(String) : [],
    pdes: r.pdes == null ? null : String(r.pdes),
  }));
}

/** Lower case, " (spacecraft)"-style suffix removed, spaces collapsed. */
export function normalizeName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Judges one claim against the lookup entries for its ID. */
export function judge(claim: IdClaim, entries: readonly LookupEntry[], query: string): IdCheck {
  const hit = entries.filter((e) => e.spkid === String(claim.id));
  if (hit.length === 0) {
    const others = entries.map((e) => `${e.spkid} ${e.name}`).join("; ");
    return {
      claim,
      pass: false,
      found: "",
      note: `Horizons knows no object ${claim.id}${others ? ` (found: ${others})` : ""}`,
      query,
    };
  }
  const want = normalizeName(claim.horizonsName ?? claim.name);
  const e = hit.find((x) => [x.name, ...x.alias].some((n) => normalizeName(n) === want));
  if (!e) {
    return {
      claim,
      pass: false,
      found: hit.map((x) => x.name).join("; "),
      note: `ID ${claim.id} is ${hit.map((x) => `"${x.name}"`).join(", ")}, not "${claim.horizonsName ?? claim.name}"`,
      query,
    };
  }
  return { claim, pass: true, found: e.name, note: "", query };
}

/** Looks up every claim by ID, in ascending ID order, one request each. */
export async function checkIds(claims: readonly IdClaim[], client: Fetcher): Promise<IdCheck[]> {
  const out: IdCheck[] = [];
  for (const c of [...claims].sort((a, b) => a.id - b.id || a.source.localeCompare(b.source))) {
    const res = await client.get(lookupParams(String(c.id)), HORIZONS_LOOKUP_API);
    out.push(judge(c, parseLookup(res.body, res.query), res.query));
  }
  return out;
}

/** The claims in data/bodies.json (origin included) and, when present, data/catalog.json's `objects`. */
export function claimsFrom(
  bodies: BodiesFile,
  catalog?: { objects?: Array<{ id: number; name: string; horizons_name?: string }> },
): IdClaim[] {
  const out: IdClaim[] = bodies.bodies.map((b) => ({ id: b.id, name: b.name, source: "data/bodies.json" }));
  for (const o of catalog?.objects ?? []) {
    out.push({
      id: o.id,
      name: o.name,
      ...(o.horizons_name ? { horizonsName: o.horizons_name } : {}),
      source: "data/catalog.json",
    });
  }
  return out;
}

export function formatReport(rows: readonly IdCheck[]): string {
  const lines = [
    "| ID | Name | Source | Horizons | Result |",
    "|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.claim.id} | ${r.claim.name} | ${r.claim.source} | ${r.found || "-"} | ${r.pass ? "pass" : `FAIL: ${r.note}`} |`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const bodies = JSON.parse(readFileSync(`${root}data/bodies.json`, "utf8")) as BodiesFile;
  const catalogPath = `${root}data/catalog.json`;
  const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")) : undefined;
  const client = new HorizonsClient({
    cacheDir: `${root}.cache/horizons`,
    offline: process.argv.includes("--offline"),
    budget: 100,
  });
  const rows = await checkIds(claimsFrom(bodies, catalog), client);
  process.stdout.write(formatReport(rows));
  const failed = rows.filter((r) => !r.pass);
  process.stdout.write(
    failed.length === 0
      ? `check-ids: all ${rows.length} IDs match (${client.requests} requests, ${client.cacheHits} cached)\n`
      : `check-ids: ${failed.length} of ${rows.length} IDs do not match\n`,
  );
  if (failed.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
