import { readFileSync } from "node:fs";
import { bench, describe } from "vitest";
import { createEphemeris, type ChunkLoader, type EphemerisManifest } from "./ephemeris";

// VN-EPH-005: evaluation speed on the committed files (F3). Budget: under 2 microseconds per call amortised over
// 1e5 calls on the reference machine (docs/TESTBED.md). `npm run bench` prints the table; the budget and the
// zero-allocation check are asserted in ephemeris.perf.test.ts so they run with `npm test`.

const root = new URL("../../../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("public/ephem/manifest.json", root), "utf8")) as EphemerisManifest;
const loader: ChunkLoader = async (file) => readFileSync(new URL(`public/ephem/${file}`, root));
const e = createEphemeris(manifest, loader);
const t0 = 25 * 365.25 * 86400;
await e.load(t0);
const out = new Float64Array(6);
const CALLS = 100_000;
const STEP = 37.3; // s; walks across several segments of every object

describe("ephemeris evaluation, 1e5 calls", () => {
  bench("Earth heliocentric state", () => {
    for (let i = 0; i < CALLS; i++) e.state(399, t0 + i * STEP, out);
  });
  bench("Moon heliocentric state (composed on Earth)", () => {
    for (let i = 0; i < CALLS; i++) e.state(301, t0 + i * STEP, out);
  });
  bench("Moon geocentric state", () => {
    for (let i = 0; i < CALLS; i++) e.relativeState(301, t0 + i * STEP, out);
  });
});
