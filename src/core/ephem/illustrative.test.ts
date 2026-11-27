import { describe, expect, it } from "vitest";
import { createEphemeris } from "./ephemeris";
import { writeEphemeris } from "./format";
import { edgeFor, illustrativePeriod, illustrativeState, type IllustrativeEdge } from "./illustrative";

// The reference is the closed-form ellipse (own Kepler solver), independent of elements.ts.
const MU = 4902.800118; // Moon, JPL DE440
const EDGE: IllustrativeEdge = { t: 1000, mu: MU, elements: [1800, 0.05, 1.57, 0.4, 0.9, 0.2] };

function closedForm(t: number): number[] {
  const [a, e, i, node, w, m0] = EDGE.elements;
  const M = m0 + Math.sqrt(MU / a ** 3) * (t - EDGE.t);
  let E = M;
  for (let k = 0; k < 50; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const u = a * (Math.cos(E) - e);
  const v = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return [
    (Math.cos(w) * Math.cos(node) - Math.sin(w) * Math.sin(node) * Math.cos(i)) * u +
      (-Math.sin(w) * Math.cos(node) - Math.cos(w) * Math.sin(node) * Math.cos(i)) * v,
    (Math.cos(w) * Math.sin(node) + Math.sin(w) * Math.cos(node) * Math.cos(i)) * u +
      (-Math.sin(w) * Math.sin(node) + Math.cos(w) * Math.cos(node) * Math.cos(i)) * v,
    Math.sin(w) * Math.sin(i) * u + Math.cos(w) * Math.sin(i) * v,
  ];
}

describe("illustrative orbit (T-090)", () => {
  it("VN-EPH-011: the orbiter moves along the edge's ellipse at its period", () => {
    const out = new Float64Array(6);
    for (const t of [EDGE.t, EDGE.t + 1234.5, EDGE.t + 86400 * 40, EDGE.t - 3e5]) {
      illustrativeState(EDGE, t, out);
      const r = closedForm(t);
      expect(Math.hypot(out[0]! - r[0]!, out[1]! - r[1]!, out[2]! - r[2]!)).toBeLessThan(1e-6);
    }
    // VN-EPH-011: "the right period": LRO-like 1800 km orbit, 2 pi sqrt(1800^3 / 4902.8) = 6852.8 s.
    const p = illustrativePeriod(EDGE);
    expect(p).toBeCloseTo(6852.8, 0);
    illustrativeState(EDGE, EDGE.t + 5 * p, out);
    const at = Float64Array.from(out);
    illustrativeState(EDGE, EDGE.t, out);
    expect(Math.hypot(at[0]! - out[0]!, at[1]! - out[1]!, at[2]! - out[2]!)).toBeLessThan(1e-6);
  });

  it("VN-EPH-007: an edge applies only outside the stored span, on its own side", () => {
    const ill = { after: EDGE };
    const cov = { start: 0, end: 1000 };
    expect(edgeFor(ill, cov, 500)).toBeUndefined();
    expect(edgeFor(ill, cov, 1000)).toBeUndefined();
    expect(edgeFor(ill, cov, 1001)).toBe(EDGE);
    expect(edgeFor(ill, cov, -1)).toBeUndefined(); // before launch: nothing is drawn
    expect(edgeFor({ before: EDGE }, cov, -1)).toBe(EDGE);
    // A window's "before" edge starts at the mission's start: before launch, nothing.
    const since = { before: { ...EDGE, from: -100 } };
    expect(edgeFor(since, cov, -50)).toBe(since.before);
    expect(edgeFor(since, cov, -101)).toBeUndefined();
    expect(edgeFor(undefined, cov, 2000)).toBeUndefined();
    expect(edgeFor(ill, null, 2000)).toBeUndefined();
  });
});

describe("illustrative orbit in the ephemeris (T-090)", () => {
  // The Moon fixed at (1e5, 2e5, 3e5) km from the Sun over [0, 1e6] s; the orbiter stored at (100, 0, 0) from it
  // over [0, 1000] s, its illustrative orbit after that.
  const constant = (id: number, center: number, x: number, y: number, z: number, t1: number) =>
    writeEphemeris({
      objectId: id,
      centerId: center,
      degree: 1,
      segments: [{ t0: 0, t1, coeffs: [x, 0, y, 0, z, 0] }],
    });
  const files: Record<string, Uint8Array> = {
    "301/a.bin": constant(301, 10, 1e5, 2e5, 3e5, 1e6),
    "-85/a.bin": constant(-85, 301, 100, 0, 0, 1000),
  };
  const eph = () =>
    createEphemeris(
      {
        objects: [
          { id: 10, name: "Sun", origin: true },
          { id: 301, name: "Moon", center: 10, chunks: [{ file: "301/a.bin", coverage: { start: 0, end: 1e6 } }] },
          {
            id: -85,
            name: "LRO",
            center: 301,
            chunks: [{ file: "-85/a.bin", coverage: { start: 0, end: 1000 } }],
            illustrative: { after: EDGE },
          },
        ],
      },
      async (f) => files[f]!,
    );

  it("VN-EPH-011: after the stored span the orbiter is on the illustrative orbit around its parent, never exact", async () => {
    const e = eph();
    await e.load(500);
    await e.load(5000);
    const out = new Float64Array(6);
    expect(e.illustrative(-85, 500, out)).toBe("outside"); // inside the span: the exact state is what is drawn
    expect(e.state(-85, 500, out)).toBe("ok");
    expect(e.state(-85, 5000, out)).toBe("outside"); // no exact position is ever invented
    expect(e.illustrativeEdge(-85, 5000)).toBe(EDGE);
    expect(e.illustrative(-85, 5000, out)).toBe("ok");
    const r = closedForm(5000);
    expect(Math.hypot(out[0]! - 1e5 - r[0]!, out[1]! - 2e5 - r[1]!, out[2]! - 3e5 - r[2]!)).toBeLessThan(1e-6);
    // VN-EPH-007: before the span (launch) there is nothing to draw.
    expect(e.illustrative(-85, -10, out)).toBe("outside");
    expect(e.illustrative(301, 5000, out)).toBe("outside");
  });
});
