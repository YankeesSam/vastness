import { describe, expect, it } from "vitest";
import { AU_KM } from "../core/constants";
import { clipPlanes, FAR_KM, MIN_NEAR_KM, toCamera } from "./origin";

const f32 = (a: ArrayLike<number>) => [Math.fround(a[0]!), Math.fround(a[1]!), Math.fround(a[2]!)];

describe("floating origin", () => {
  it("VN-SCN-004: a point 1 m from a camera at 150 AU keeps millimetre precision in float32", () => {
    const cam = new Float64Array([150 * AU_KM, 3.2e7, -1.1e9]);
    const world = new Float64Array([cam[0]! + 0.001, cam[1]! - 0.0005, cam[2]! + 0.00025]);
    const out = new Float64Array(3);
    toCamera(world, cam, out);
    const [x, y, z] = f32(out);
    // VN-SCN-004: under 1 mm of error after the float32 cast.
    expect(Math.abs(x! - 0.001)).toBeLessThan(1e-6);
    expect(Math.abs(y! + 0.0005)).toBeLessThan(1e-6);
    expect(Math.abs(z! - 0.00025)).toBeLessThan(1e-6);
    // Plain float32 world coordinates at 150 AU cannot represent a 1 m offset at all.
    expect(Math.fround(cam[0]! + 0.001) - Math.fround(cam[0]!)).not.toBeCloseTo(0.001, 6);
  });

  it("VN-SCN-004: offset reads from and writes to strided arrays", () => {
    const world = new Float64Array([0, 0, 0, 10, 20, 30]);
    const cam = new Float64Array([1, 2, 3]);
    const out = new Float32Array(6);
    toCamera(world, cam, out, 3, 3);
    expect([...out]).toEqual([0, 0, 0, 9, 18, 27]);
  });

  it("VN-CAM-004: near and far adapt to the focus distance", () => {
    expect(clipPlanes(1)).toEqual({ near: MIN_NEAR_KM, far: FAR_KM });
    expect(clipPlanes(1e8).near).toBeCloseTo(100, 9);
    expect(clipPlanes(1e8).far).toBe(1e12);
    // VN-CAM-004: a craft 1 km away and the Sun 150 million km away fit in the same frustum.
    const p = clipPlanes(1);
    expect(p.near).toBeLessThan(1);
    expect(p.far).toBeGreaterThan(1.5e8);
    expect(clipPlanes(0).near).toBe(MIN_NEAR_KM);
    expect(clipPlanes(Number.NaN).near).toBe(MIN_NEAR_KM);
  });
});
