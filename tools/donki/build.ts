// T-086 (VN-EXT-001): fetches NASA DONKI's CME, geomagnetic storm (GST) and interplanetary shock (IPS) lists over
// the span in data/spaceweather.json and writes public/spaceweather/donki.json. Run by hand or by the refresh job:
//   node --experimental-strip-types --no-warnings tools/donki/build.ts [--offline]
// The API key comes from NASA_API_KEY or the repository's .env and is never written anywhere (tools/net/polite.ts).
// DONKI refuses ranges over 60 days, so each list is asked for a month at a time, serially, 1 s apart, cached in
// .cache/donki, so a rebuild on the same cache is byte-identical.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { recordsJson } from "../net/json.ts";
import { nasaApiKey, PoliteClient, PoliteError } from "../net/polite.ts";
import { buildDonki, monthChunks } from "./parse.ts";

export const DONKI_API = "https://api.nasa.gov/DONKI";

export function donkiUrl(kind: string, start: string, end: string): string {
  return `${DONKI_API}/${kind}?startDate=${start}&endDate=${end}`;
}

async function main(): Promise<void> {
  const root = new URL("../../", import.meta.url);
  const path = (p: string): string => fileURLToPath(new URL(p, root));
  const span = (
    JSON.parse(readFileSync(path("data/spaceweather.json"), "utf8")) as { donki: { start: string; end: string } }
  ).donki;
  const offline = process.argv.includes("--offline");
  const key = nasaApiKey(process.env, existsSync(path(".env")) ? readFileSync(path(".env"), "utf8") : null);
  if (!key && !offline) throw new Error("NASA_API_KEY is not set (environment or .env)");
  const secret = key ? { api_key: key } : {};
  const client = new PoliteClient({ cacheDir: path(".cache/donki"), name: "DONKI", offline, budget: 700 });
  const retrieved: string[] = [];
  const get = async (kind: string, a: string, b: string): Promise<unknown> => {
    const r = await client.get(donkiUrl(kind, a, b), secret);
    retrieved.push(r.retrieved.slice(0, 10));
    return r.body.trim() === "" ? [] : JSON.parse(r.body);
  };

  // The flare list: one probe on a client of its own, since a 404 there must not stop the run.
  let flareNote: string | null = null;
  try {
    const probe = new PoliteClient({ cacheDir: path(".cache/donki"), name: "DONKI", offline, budget: 1 });
    await probe.get(donkiUrl("FLR", "2024-05-01", "2024-05-31"), secret);
    flareNote = "DONKI's flare list answers again: flare classes can be added (tools/donki/parse.ts)";
  } catch (e) {
    if (!(e instanceof PoliteError)) throw e;
    flareNote =
      "DONKI's flare list (FLR) was not available when this file was built (HTTP 404 on api.nasa.gov, 2026-11-27): flares are the ones DONKI links to CMEs, with time and source but no class";
  }

  const cme: unknown[] = [];
  const gst: unknown[] = [];
  const ips: unknown[] = [];
  for (const [a, b] of monthChunks(span.start, span.end)) {
    cme.push(await get("CME", a, b));
    gst.push(await get("GST", a, b));
    ips.push(await get("IPS", a, b));
    process.stdout.write(`\r${a}`);
  }
  const file = buildDonki(
    { cme, gst, ips },
    { start: span.start, end: span.end, retrieved: retrieved.sort().at(-1) ?? span.end, flareNote },
  );
  mkdirSync(path("public/spaceweather"), { recursive: true });
  const out = recordsJson(file as unknown as Record<string, unknown>);
  writeFileSync(path("public/spaceweather/donki.json"), out);
  console.log(
    `\ndonki: ${file.cmes.length} CMEs (${file.skipped.length} without a direction), ${file.flares.length} flares, ${file.storms.length} storms, ${file.shocks.length} shocks; ${out.length} bytes; ${client.requests} requests, ${client.cacheHits} cached`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
