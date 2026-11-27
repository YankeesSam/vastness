import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEphemeris, type EphemerisManifest } from "../../core/ephem/ephemeris";
import {
  createOrbitSamples,
  ORBIT_PERIOD_DAYS,
  orbitWindow,
  sampleOrbit,
  type OrbitWindow,
} from "../../core/orbits/sample";
import { parseUtc } from "../../core/time/scales";

// VN-SCN-002, VN-EPH-006 against the committed ephemeris (F3): at a fixed 2026 date every planet's path is one full
// period of stored Horizons data (Neptune's 165 years slid inside 1900-2100), with no sample missing or approximated.

const dir = new URL("../../../public/ephem/", import.meta.url);

describe("orbits from the committed ephemeris", () => {
  it("VN-SCN-002: every planet's full period at 2026-01-01 is ephemeris data, nothing missing", async () => {
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8")) as EphemerisManifest;
    const eph = createEphemeris(manifest, async (file) => readFileSync(new URL(file, dir)));
    const t = parseUtc("2026-01-01T00:00:00Z");
    const w: OrbitWindow = { t0: 0, span: 0 };
    for (const id of [199, 299, 399, 499, 599, 699, 799, 899]) {
      const P = ORBIT_PERIOD_DAYS[id]! * 86400;
      const cov = eph.coverage(id)!;
      expect(orbitWindow(t, P, cov.start, cov.end, w)).toBe(true);
      expect(w.span).toBe(P); // a whole period fits in 1900-2100 for every planet
      expect(w.t0).toBeGreaterThanOrEqual(cov.start);
      expect(w.t0 + w.span).toBeLessThanOrEqual(cov.end);
      const s = createOrbitSamples();
      const st = new Float64Array(6);
      for (let i = 0; i < s.n; i++) await eph.load(w.t0 + (i * w.span) / (s.n - 1), [id]);
      sampleOrbit((ti, out, o) => eph.peek(id, ti, st) === "ok" && (out.set(st.subarray(0, 3), o), true), t, P, s, w);
      expect(s.missing, `${id}`).toBe(0);
      // The path passes within the fit tolerance (10 km) of where the planet is now (VN-EPH-003).
      eph.peek(id, t, st);
      let closest = Infinity;
      for (let i = 0; i < s.n; i++)
        closest = Math.min(
          closest,
          Math.hypot(s.pos[3 * i]! - st[0]!, s.pos[3 * i + 1]! - st[1]!, s.pos[3 * i + 2]! - st[2]!),
        );
      if (id !== 899) expect(closest, `${id}`).toBeLessThan(10); // centred: the middle sample is now
    }
  });
});
