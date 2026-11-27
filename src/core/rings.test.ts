import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEphemeris, type EphemerisManifest } from "./ephem/ephemeris";
import { RINGS_INNER_KM, RINGS_OUTER_KM, ringAt, ringOpacity, saturnPole } from "./rings";
import { parseUtc } from "./time/scales";

const DEG = Math.PI / 180;

async function sunElevationAtSaturn(iso: string): Promise<number> {
  const dir = new URL("../../public/ephem/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8")) as EphemerisManifest;
  const eph = createEphemeris(manifest, async (file) => readFileSync(new URL(file, dir)));
  const t = parseUtc(iso);
  await eph.load(t, [10, 699]);
  const sun = new Float64Array(6);
  const sat = new Float64Array(6);
  expect(eph.state(10, t, sun)).toBe("ok");
  expect(eph.state(699, t, sat)).toBe("ok");
  const d = [sun[0]! - sat[0]!, sun[1]! - sat[1]!, sun[2]! - sat[2]!];
  const n = Math.hypot(d[0]!, d[1]!, d[2]!);
  const p = saturnPole(t);
  const e = Math.asin((d[0]! * p[0]! + d[1]! * p[1]! + d[2]! * p[2]!) / n) / DEG;
  return e;
}

describe("Saturn's rings (VN-SCN-006)", () => {
  it("VN-SCN-006: ring regions and gaps follow the NSSDCA fact sheet radii", () => {
    expect(RINGS_INNER_KM).toBe(74_658);
    expect(RINGS_OUTER_KM).toBe(136_780);
    expect(ringAt(80_000)!.name).toBe("C");
    expect(ringAt(100_000)!.name).toBe("B");
    expect(ringAt(120_000)!.name).toBe("Cassini division");
    expect(ringAt(130_000)!.name).toBe("A");
    expect(ringAt(70_000)).toBeNull();
    expect(ringAt(140_000)).toBeNull();
  });

  it("VN-SCN-006: opacity 1 - exp(-tau/mu): B densest, Cassini division nearly clear, thicker towards edge-on", () => {
    expect(ringOpacity(100_000)).toBeGreaterThan(0.7);
    expect(ringOpacity(120_000)).toBeLessThan(0.1);
    expect(ringOpacity(80_000, 0.2)).toBeGreaterThan(ringOpacity(80_000, 1));
    expect(ringOpacity(50_000)).toBe(0);
  });

  it("VN-SCN-006: the ring plane holds the Sun at Saturn's equinox, 2009-08-11 (NASA Cassini), within 0.05 degrees", async () => {
    expect(Math.abs(await sunElevationAtSaturn("2009-08-11T00:00:00Z"))).toBeLessThan(0.05);
  });

  it("VN-SCN-006: at the northern solstice, 2017-05-24 (NASA Cassini), the Sun is 26.7 degrees north of the rings (obliquity 26.73)", async () => {
    expect(Math.abs((await sunElevationAtSaturn("2017-05-24T00:00:00Z")) - 26.73)).toBeLessThan(0.1);
  });
});
