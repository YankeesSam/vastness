import { describe, expect, it } from "vitest";
import {
  createOrbit,
  eyeOffset,
  keyAction,
  MAX_DISTANCE_KM,
  MAX_ELEVATION,
  minDistanceFor,
  orbit,
  panDelta,
  pinch,
  wheelSteps,
  zoom,
  ZOOM_RATIO,
} from "./orbit";

const LIGHT_DAY_KM = 299_792.458 * 86_400;

describe("camera orbit", () => {
  it("VN-CAM-001: one wheel step changes the distance by the same ratio from metres to light-days", () => {
    for (const d of [0.002, 1, 6371, 1.5e8, LIGHT_DAY_KM]) {
      const s = createOrbit(d);
      zoom(s, 1, 1e-3);
      expect(s.distance / d).toBeCloseTo(ZOOM_RATIO, 12);
      zoom(s, -1, 1e-3);
      expect(s.distance / d).toBeCloseTo(1, 12);
    }
  });

  it("VN-CAM-001: zoom clamps to 1.05 x the radius and to 1e11 km", () => {
    const s = createOrbit(7000);
    zoom(s, -100, minDistanceFor(6371));
    expect(s.distance).toBeCloseTo(6371 * 1.05, 9);
    zoom(s, 1000, minDistanceFor(6371));
    expect(s.distance).toBe(MAX_DISTANCE_KM);
    expect(minDistanceFor(0)).toBe(1e-3);
  });

  it("VN-CAM-001: wheel deltas in pixels, lines and pages become steps", () => {
    expect(wheelSteps(100, 0)).toBeCloseTo(1, 12);
    expect(wheelSteps(-100, 0)).toBeCloseTo(-1, 12);
    expect(wheelSteps(3, 1)).toBeCloseTo(1, 12); // three lines is one notch
    expect(wheelSteps(1, 2)).toBeCloseTo(3, 12);
  });

  it("VN-CAM-001: pinch zoom divides the distance by the finger-spread ratio", () => {
    const s = createOrbit(1000);
    pinch(s, 2, 1e-3);
    expect(s.distance).toBeCloseTo(500, 9);
    pinch(s, 0, 1e-3); // degenerate spread is ignored
    expect(s.distance).toBeCloseTo(500, 9);
  });

  it("VN-CAM-001: orbit wraps azimuth and clamps elevation short of the poles", () => {
    const s = createOrbit(10);
    orbit(s, 4 * Math.PI + 0.5, 10);
    expect(s.azimuth).toBeCloseTo(0.5, 12);
    expect(s.elevation).toBe(MAX_ELEVATION);
    orbit(s, 0, -20);
    expect(s.elevation).toBe(-MAX_ELEVATION);
    expect(MAX_ELEVATION).toBeLessThan(Math.PI / 2);
  });

  it("VN-CAM-001: the eye sits at the orbit distance in the azimuth/elevation direction (y up)", () => {
    const s = createOrbit(100);
    const out = new Float64Array(3);
    eyeOffset(s, out);
    expect([...out].map((v) => +v.toFixed(9))).toEqual([0, 0, 100]);
    orbit(s, Math.PI / 2, Math.PI / 6);
    eyeOffset(s, out);
    expect(Math.hypot(out[0]!, out[1]!, out[2]!)).toBeCloseTo(100, 9);
    expect(out[1]).toBeCloseTo(50, 9);
    expect(out[0]).toBeCloseTo(100 * Math.cos(Math.PI / 6), 9);
  });

  it("VN-CAM-001: pan moves the focus in the view plane so the point under the cursor follows it", () => {
    const s = createOrbit(1000);
    orbit(s, 0.7, 0.3);
    const fov = Math.PI / 4;
    const out = new Float64Array(3);
    panDelta(s, 80, -30, 800, fov, out);
    const eye = new Float64Array(3);
    eyeOffset(s, eye);
    // In the view plane: perpendicular to the view direction.
    expect(out[0]! * eye[0]! + out[1]! * eye[1]! + out[2]! * eye[2]!).toBeCloseTo(0, 6);
    // Size: pixels x (visible height at the focus / viewport height).
    const perPx = (2 * 1000 * Math.tan(fov / 2)) / 800;
    expect(Math.hypot(out[0]!, out[1]!, out[2]!)).toBeCloseTo(Math.hypot(80, 30) * perPx, 6);
    // Dragging right moves the focus left (the world follows the cursor).
    const right = [Math.cos(0.7), 0, -Math.sin(0.7)];
    expect(out[0]! * right[0]! + out[2]! * right[2]!).toBeCloseTo(-80 * perPx, 6);
  });

  it("VN-CAM-001: basic keys orbit and zoom", () => {
    expect(keyAction("ArrowLeft")).toEqual({ kind: "orbit", dAz: -Math.PI / 36, dEl: 0 });
    expect(keyAction("ArrowUp")).toEqual({ kind: "orbit", dAz: 0, dEl: Math.PI / 36 });
    expect(keyAction("+")).toEqual({ kind: "zoom", steps: -1 });
    expect(keyAction("=")).toEqual({ kind: "zoom", steps: -1 });
    expect(keyAction("-")).toEqual({ kind: "zoom", steps: 1 });
    expect(keyAction("PageDown")).toEqual({ kind: "zoom", steps: 5 });
    expect(keyAction("x")).toBeNull();
  });
});
