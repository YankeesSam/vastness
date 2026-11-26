import { readFileSync } from "node:fs";
import { PerformanceObserver } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { createEphemeris, type ChunkLoader, type EphemerisManifest } from "./ephemeris";

// VN-EPH-005: under 2 microseconds per evaluation amortised over 1e5 calls, and no allocation in steady state.
// Allocation is detected two ways over 1e6 calls: heap growth, and any garbage collection during the loop (a
// scavenge would hide growth). 1e6 calls allocating even 16 bytes each would show as 16 MB or as a GC.
// The walk stays inside the 2020s chunk (1e6 x 37.3 s is about 14 months from 2025).

const root = new URL("../../../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("public/ephem/manifest.json", root), "utf8")) as EphemerisManifest;
const loader: ChunkLoader = async (file) => readFileSync(new URL(`public/ephem/${file}`, root));
const t0 = 25 * 365.25 * 86400;
const STEP = 37.3;

async function ready() {
  const e = createEphemeris(manifest, loader);
  await e.load(t0);
  return e;
}

describe("runtime ephemeris performance (F3)", () => {
  it("VN-EPH-005: a composed Moon state takes under 2 microseconds amortised over 1e5 calls", async () => {
    const e = await ready();
    const out = new Float64Array(6);
    let sum = 0;
    for (let i = 0; i < 100_000; i++) e.state(301, t0 + i * STEP, out); // warm up the JIT
    let best = Infinity;
    for (let run = 0; run < 5; run++) {
      const a = performance.now();
      for (let i = 0; i < 100_000; i++) {
        e.state(301, t0 + i * STEP, out);
        sum += out[0]!;
      }
      best = Math.min(best, ((performance.now() - a) * 1000) / 100_000);
    }
    expect(Number.isFinite(sum)).toBe(true);
    expect(best).toBeLessThan(2); // microseconds per call
  });

  it("VN-EPH-005: steady-state evaluation allocates nothing (no heap growth, no GC over 1e6 calls)", async () => {
    const e = await ready();
    const out = new Float64Array(6);
    const ids = [399, 301, 599, 10];
    // Warm up until the optimising compiler has the loop (the first million calls run partly in the interpreter,
    // which boxes numbers).
    for (let i = 0; i < 2_000_000; i++) {
      e.state(ids[i & 3]!, t0 + i * STEP * 0.5, out);
      e.relativeState(301, t0 + i * STEP * 0.5, out);
    }
    let gcs = 0;
    const obs = new PerformanceObserver((list) => {
      gcs += list.getEntries().length;
    });
    obs.observe({ entryTypes: ["gc"] });
    await new Promise((r) => setTimeout(r, 20));
    gcs = 0;
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 1_000_000; i++) {
      e.state(ids[i & 3]!, t0 + i * STEP, out);
      e.relativeState(301, t0 + i * STEP, out);
    }
    const grown = process.memoryUsage().heapUsed - before;
    await new Promise((r) => setTimeout(r, 20));
    obs.disconnect();
    expect(gcs).toBe(0);
    // 2e6 evaluations boxing one number each would be 32 MB; the test runner itself allocates about 1 MB meanwhile.
    expect(grown).toBeLessThan(4 * 1024 * 1024);
  });
});
