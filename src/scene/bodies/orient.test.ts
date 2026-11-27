import { readFileSync } from "node:fs";
import { Matrix4, SphereGeometry, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createEphemeris, type EphemerisManifest } from "../../core/ephem/ephemeris";
import { sceneFromEcliptic } from "../../core/frames";
import { bodyToEcliptic } from "../../core/rotation";
import { parseUtc } from "../../core/time/scales";
import { bodyMeshMatrix } from "./orient";

/** The sphere vertex at texture coordinates (u, v), mesh-local (64 x 32 segments, as Bodies draws); any u at the pole. */
function vertexAt(u: number, v: number): Vector3 {
  const g = new SphereGeometry(1, 64, 32);
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++)
    if ((v === 1 || Math.abs(uv.getX(i) - u) < 1e-6) && Math.abs(uv.getY(i) - v) < 1e-6)
      return new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
  throw new Error(`no vertex at ${u}, ${v}`);
}

describe("body orientation in the scene", () => {
  it("VN-SCN-009: the map's longitude 0 and 90 E and the north pole land on the body's IAU axes", () => {
    const mat = new Matrix4();
    const b = new Float64Array(9);
    const s = new Float64Array(3);
    for (const id of [399, 499, 599, 799]) {
      const t = 8.5e8;
      expect(bodyMeshMatrix(id, t, mat)).toBe(true);
      bodyToEcliptic(id, t, b);
      for (const [u, v, c] of [
        [0.5, 0.5, 0], // longitude 0 on the equator: body x
        [0.75, 0.5, 1], // 90 E: body y
        [0.5, 1, 2], // the north pole: body z (top row of the map)
      ] as const) {
        const p = vertexAt(u, v).applyMatrix4(mat);
        sceneFromEcliptic([b[c]!, b[3 + c]!, b[6 + c]!], s);
        expect(p.x).toBeCloseTo(s[0]!, 6);
        expect(p.y).toBeCloseTo(s[1]!, 6);
        expect(p.z).toBeCloseTo(s[2]!, 6);
      }
    }
    expect(bodyMeshMatrix(-31, 0, mat)).toBe(false);
  });

  it("VN-SCN-009: at 12:00 UTC on the June solstice the Sun stands over longitude 0 (within the equation of time) and 23.4 N", async () => {
    const dir = new URL("../../../public/ephem/", import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8")) as EphemerisManifest;
    const eph = createEphemeris(manifest, async (file) => readFileSync(new URL(file, dir)));
    const t = parseUtc("2026-06-21T12:00:00Z")!;
    await eph.load(t, [399]);
    const st = new Float64Array(6);
    expect(eph.state(399, t, st)).toBe("ok");
    const toSun = new Float64Array(3);
    sceneFromEcliptic([-st[0]!, -st[1]!, -st[2]!], toSun);
    const mat = new Matrix4();
    bodyMeshMatrix(399, t, mat);
    // Scene to mesh-local, then to longitude and latitude on the map.
    const d = new Vector3(toSun[0], toSun[1], toSun[2]).normalize().applyMatrix4(mat.clone().transpose());
    const lon = (Math.atan2(-d.z, d.x) * 180) / Math.PI;
    const lat = (Math.asin(d.y) * 180) / Math.PI;
    // Equation of time on 21 June: -1.6 min (the Sun 0.4 degree east of 0); the solstice declination 23.44.
    expect(Math.abs(lon - 0.4)).toBeLessThan(0.5);
    expect(lat).toBeCloseTo(23.44, 1);
  });
});
