import { describe, expect, it } from "vitest";
import { fitSegment } from "../../src/core/ephem/chebyshev.ts";
import { writeEphemeris } from "../../src/core/ephem/format.ts";
import { addIllustrativeEdges } from "./edges.ts";

// A circular polar orbit of radius 1800 km about the Moon (closed form), stored as one position segment.
const MU = 4902.800118;
const R = 1800;
const W = Math.sqrt(MU / R ** 3);
const at = (t: number) => [
  R * Math.cos(W * t),
  0,
  R * Math.sin(W * t),
  -R * W * Math.sin(W * t),
  0,
  R * W * Math.cos(W * t),
];

function file(t0: number, t1: number): Uint8Array {
  const ts = Array.from({ length: 41 }, (_, i) => t0 + ((t1 - t0) * i) / 40);
  const s = ts.map(at);
  const coeffs = fitSegment(
    t0,
    t1,
    ts,
    s.map((x) => x.slice(0, 3)),
    s.map((x) => x.slice(3)),
    13,
  );
  return writeEphemeris({ objectId: -85, centerId: 301, degree: 13, segments: [{ t0, t1, coeffs }] });
}

describe("illustrative edges (T-090)", () => {
  it("VN-EPH-011: an orbiter gets the osculating elements at the end of its span; a window gets both ends", () => {
    const files = new Map([["-85/a.bin", file(0, 1200)]]);
    const mission = {
      id: -85,
      kind: "spacecraft",
      center: 301,
      stored: "mission",
      coverage: { start: 0, end: 1200 },
      chunks: [{ file: "-85/a.bin" }],
    };
    const windowed = { ...mission, stored: "window", mission: { coverage: { start: -5000 } } };
    const helio = { id: -31, kind: "spacecraft", center: 10, coverage: { start: 0, end: 1 }, chunks: [{ file: "x" }] };
    const objects: Record<string, unknown>[] = [mission, windowed, helio];
    addIllustrativeEdges(objects, files);
    const ill = (mission as { illustrative?: unknown }).illustrative as {
      after: { t: number; mu: number; elements: number[] };
      before?: unknown;
    };
    expect(ill.before).toBeUndefined(); // the whole mission is stored: before it, the orbiter had not launched
    expect(ill.after.t).toBe(1200);
    expect(ill.after.mu).toBe(MU);
    expect(ill.after.elements[0]).toBeCloseTo(R, 3); // a
    expect(ill.after.elements[1]).toBeLessThan(1e-5); // e
    expect(ill.after.elements[2]).toBeCloseTo(Math.PI / 2, 6); // polar
    expect((windowed as { illustrative?: { before?: { from?: number } } }).illustrative?.before?.from).toBe(-5000);
    expect((helio as { illustrative?: unknown }).illustrative).toBeUndefined(); // heliocentric: never
  });
});
