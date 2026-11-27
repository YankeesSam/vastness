import { PerformanceObserver } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { fitSegment } from "./chebyshev";
import { createEphemeris, evaluateFile, type ChunkLoader } from "./ephemeris";
import {
  ELEMENT_L,
  elementSeries,
  elementsToState,
  fitElementSegment,
  stateToElements,
  unwrapAngles,
} from "./elements";
import { ELEMENTS_FILE_VERSION, HEADER_BYTES_V2, KIND_ELEMENTS, readEphemeris, writeEphemeris } from "./format";

// The reference is a numerical integration of perturbed two-body motion (RK4, 5 s steps), independent of the
// element code: element segments are fitted to its samples and checked at held-out times against it.

const MU_MOON = 4902.800118; // km^3/s^2, JPL DE440 (Park et al. 2021)
const R_MOON = 1737.4; // km, IAU WGCCRE mean radius
const J2_MOON = 2.033e-4; // GRAIL GL0660B (Konopliv et al. 2013), unnormalised
const MU_EARTH = 398600.435507; // km^3/s^2, DE440
const D_EARTH = 384_400; // km, mean Earth-Moon distance
const W_EARTH = (2 * Math.PI) / (27.321661 * 86400); // rad/s, sidereal month
const DEG = Math.PI / 180;

type Accel = (t: number, s: Float64Array, out: Float64Array) => void;

/** Moon point mass plus J2 (pole along z). */
const j2Accel: Accel = (_t, s, a) => {
  const [x, y, z] = [s[0]!, s[1]!, s[2]!];
  const r2 = x * x + y * y + z * z;
  const r = Math.sqrt(r2);
  const k = -MU_MOON / (r2 * r);
  const f = ((1.5 * J2_MOON * MU_MOON * R_MOON * R_MOON) / (r2 * r2 * r)) * 1;
  const zz = (5 * z * z) / r2;
  a[0] = k * x + f * x * (zz - 1);
  a[1] = k * y + f * y * (zz - 1);
  a[2] = k * z + f * z * (zz - 3);
};

/** Moon point mass plus Earth's tidal (third-body) pull, Earth on a circular orbit in the xy plane. */
const thirdBodyAccel: Accel = (t, s, a) => {
  const [x, y, z] = [s[0]!, s[1]!, s[2]!];
  const r = Math.hypot(x, y, z);
  const ex = D_EARTH * Math.cos(W_EARTH * t);
  const ey = D_EARTH * Math.sin(W_EARTH * t);
  const dx = ex - x;
  const dy = ey - y;
  const dz = -z;
  const d = Math.hypot(dx, dy, dz);
  const k = -MU_MOON / r ** 3;
  a[0] = k * x + MU_EARTH * (dx / d ** 3 - ex / D_EARTH ** 3);
  a[1] = k * y + MU_EARTH * (dy / d ** 3 - ey / D_EARTH ** 3);
  a[2] = k * z + MU_EARTH * (dz / d ** 3);
};

/** RK4 from state s0 at t0, returning states at t0 + k * every for k = 0..count. */
function integrate(accel: Accel, s0: Float64Array, t0: number, every: number, count: number, h = 5): Float64Array[] {
  const s = Float64Array.from(s0);
  const k = Array.from({ length: 4 }, () => new Float64Array(6));
  const tmp = new Float64Array(6);
  const a = new Float64Array(3);
  const deriv = (t: number, y: Float64Array, out: Float64Array) => {
    accel(t, y, a);
    out.set([y[3]!, y[4]!, y[5]!, a[0]!, a[1]!, a[2]!]);
  };
  const out = [Float64Array.from(s)];
  const steps = Math.round(every / h);
  let t = t0;
  for (let c = 0; c < count; c++) {
    for (let st = 0; st < steps; st++) {
      deriv(t, s, k[0]!);
      for (let j = 0; j < 6; j++) tmp[j] = s[j]! + (h / 2) * k[0]![j]!;
      deriv(t + h / 2, tmp, k[1]!);
      for (let j = 0; j < 6; j++) tmp[j] = s[j]! + (h / 2) * k[1]![j]!;
      deriv(t + h / 2, tmp, k[2]!);
      for (let j = 0; j < 6; j++) tmp[j] = s[j]! + h * k[2]![j]!;
      deriv(t + h, tmp, k[3]!);
      for (let j = 0; j < 6; j++) s[j] = s[j]! + (h / 6) * (k[0]![j]! + 2 * k[1]![j]! + 2 * k[2]![j]! + k[3]![j]!);
      t += h;
    }
    out.push(Float64Array.from(s));
  }
  return out;
}

function initialState(a: number, e: number, i: number, node: number, peri: number, M: number): Float64Array {
  const s = new Float64Array(6);
  elementsToState(a, e, i, node, peri, M, MU_MOON, s, 0);
  return s;
}

interface Case {
  times: number[];
  states: Float64Array[];
}

/** Samples every `every` s over `days` from TDB `t0`. */
function sampleOrbit(accel: Accel, s0: Float64Array, t0: number, every: number, days: number): Case {
  const count = Math.round((days * 86400) / every);
  const states = integrate(accel, s0, t0, every, count);
  return { times: states.map((_, k) => t0 + k * every), states };
}

/**
 * Fits element segments of `segSeconds` to the even-indexed samples and returns the file and the worst error at
 * the odd-indexed (held-out) samples. Also returns the position-segment error at the same size, for comparison.
 */
function fitAndCheck(c: Case, segSeconds: number, degree: number, mu = MU_MOON) {
  const every = c.times[1]! - c.times[0]!;
  const perSeg = Math.round(segSeconds / every);
  const a0 = stateToElements(c.states[0]!, mu)[0]!;
  const meanMotion = Math.sqrt(mu / a0 ** 3);
  const segments: Array<{ t0: number; t1: number; coeffs: Float64Array }> = [];
  const posSegments: Array<{ t0: number; t1: number; coeffs: Float64Array }> = [];
  for (let k0 = 0; k0 + perSeg < c.times.length; k0 += perSeg) {
    const idx = Array.from({ length: perSeg / 2 + 1 }, (_, j) => k0 + 2 * j);
    const times = idx.map((k) => c.times[k]!);
    const states = idx.map((k) => c.states[k]!);
    const t0 = c.times[k0]!;
    const t1 = c.times[k0 + perSeg]!;
    const series = elementSeries(times, states, mu, meanMotion);
    segments.push({ t0, t1, coeffs: fitElementSegment(t0, t1, times, series, degree) });
    posSegments.push({
      t0,
      t1,
      coeffs: fitSegment(
        t0,
        t1,
        times,
        states,
        states.map((s) => s.subarray(3)),
        degree,
      ),
    });
  }
  const bytes = writeEphemeris({ objectId: -85, centerId: 301, degree, segments, kind: KIND_ELEMENTS, mu, meanMotion });
  const pos = writeEphemeris({ objectId: -85, centerId: 301, degree, segments: posSegments });
  const f = readEphemeris(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = readEphemeris(pos.buffer, pos.byteOffset, pos.byteLength);
  const out = new Float64Array(6);
  let worst = 0;
  let worstVel = 0;
  let worstPos = 0;
  const end = segments[segments.length - 1]!.t1;
  for (let k = 1; c.times[k]! < end; k += 2) {
    const s = c.states[k]!;
    expect(evaluateFile(f, c.times[k]!, out)).toBe(true);
    worst = Math.max(worst, Math.hypot(out[0]! - s[0]!, out[1]! - s[1]!, out[2]! - s[2]!));
    worstVel = Math.max(worstVel, Math.hypot(out[3]! - s[3]!, out[4]! - s[4]!, out[5]! - s[5]!));
    evaluateFile(p, c.times[k]!, out);
    worstPos = Math.max(worstPos, Math.hypot(out[0]! - s[0]!, out[1]! - s[1]!, out[2]! - s[2]!));
  }
  return { bytes, file: f, worst, worstVel, worstPos, meanMotion };
}

describe("elements and Kepler's equation", () => {
  it("VN-EPH-011: elements -> state -> elements round-trips from e = 0.001 to 0.9, prograde to retrograde", () => {
    const out = new Float64Array(6);
    for (const e of [0.001, 0.03, 0.3, 0.6, 0.9]) {
      for (const i of [5, 45, 89.7, 135]) {
        for (const M of [0.01, 1, 3, 5.5]) {
          elementsToState(1850 + 3000 * e, e, i * DEG, 1.2, 2.5, M, MU_MOON, out, 0);
          const back = stateToElements(out, MU_MOON);
          expect(back[0]).toBeCloseTo(1850 + 3000 * e, 6);
          expect(back[1]).toBeCloseTo(e, 12);
          expect(back[2]).toBeCloseTo(i * DEG, 12);
          expect(back[3]).toBeCloseTo(1.2, 10);
          // Near e = 0 only peri + M is well defined.
          if (e >= 0.03) expect(back[4]).toBeCloseTo(2.5, 9);
          expect(((back[4]! + back[5]! - 2.5 - M + 3 * Math.PI) % (2 * Math.PI)) - Math.PI).toBeCloseTo(0, 9);
        }
      }
    }
  });

  it("VN-EPH-011: the velocity is the time derivative of the Keplerian position (e = 0.02 and 0.9)", () => {
    const a = new Float64Array(6);
    const b = new Float64Array(6);
    const c = new Float64Array(6);
    for (const e of [0.02, 0.9]) {
      const sma = 6000;
      const n = Math.sqrt(MU_MOON / sma ** 3);
      const h = 0.05;
      for (const M of [0.05, 2, 4]) {
        elementsToState(sma, e, 1, 0.3, 0.7, M, MU_MOON, a, 0);
        elementsToState(sma, e, 1, 0.3, 0.7, M - n * h, MU_MOON, b, 0);
        elementsToState(sma, e, 1, 0.3, 0.7, M + n * h, MU_MOON, c, 0);
        for (let k = 0; k < 3; k++) expect(a[3 + k]).toBeCloseTo((c[k]! - b[k]!) / (2 * h), 7);
      }
    }
  });

  it("VN-EPH-011: unwrapAngles removes 2 pi jumps", () => {
    const v = unwrapAngles(Float64Array.from([6.0, 6.2, 0.1, 0.3, 6.2]));
    expect([...v].map((x) => +x.toFixed(6))).toEqual([
      6.0,
      6.2,
      +(0.1 + 2 * Math.PI).toFixed(6),
      +(0.3 + 2 * Math.PI).toFixed(6),
      6.2,
    ]);
  });
});

describe("element segments in the binary format (version 2)", () => {
  it("VN-EPH-004: an element file has kind, mu and mean motion in an 80-byte version-2 header and round-trips", () => {
    const coeffs = Float64Array.from({ length: 6 * 4 }, (_, k) => k * 0.5);
    const bytes = writeEphemeris({
      objectId: -85,
      centerId: 301,
      degree: 3,
      kind: KIND_ELEMENTS,
      mu: MU_MOON,
      meanMotion: 1e-3,
      segments: [{ t0: 0, t1: 100, coeffs }],
    });
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(dv.getUint16(4, true)).toBe(ELEMENTS_FILE_VERSION);
    expect(dv.getUint16(6, true)).toBe(HEADER_BYTES_V2);
    expect(dv.getUint16(18, true)).toBe(6);
    expect(dv.getUint16(48, true)).toBe(KIND_ELEMENTS);
    expect(dv.getFloat64(56, true)).toBe(MU_MOON);
    expect(dv.getFloat64(64, true)).toBe(1e-3);
    expect(bytes.byteLength).toBe(HEADER_BYTES_V2 + 16 + 6 * 4 * 8);
    const f = readEphemeris(bytes.buffer);
    expect(f.kind).toBe(KIND_ELEMENTS);
    expect(f.components).toBe(6);
    expect(f.mu).toBe(MU_MOON);
    expect(f.meanMotion).toBe(1e-3);
    expect([...f.coeffs]).toEqual([...coeffs]);
  });

  it("VN-EPH-004: rejects element files without mu, with the wrong component count, or an unknown kind", () => {
    const seg = [{ t0: 0, t1: 1, coeffs: new Float64Array(12) }];
    expect(() => writeEphemeris({ objectId: 1, centerId: 2, degree: 1, kind: KIND_ELEMENTS, segments: seg })).toThrow(
      /mu/,
    );
    expect(() =>
      writeEphemeris({
        objectId: 1,
        centerId: 2,
        degree: 1,
        kind: KIND_ELEMENTS,
        mu: 1,
        meanMotion: 0,
        segments: [{ t0: 0, t1: 1, coeffs: new Float64Array(6) }],
      }),
    ).toThrow(/expected 12/);
    const ok = writeEphemeris({
      objectId: 1,
      centerId: 2,
      degree: 1,
      kind: KIND_ELEMENTS,
      mu: 1,
      meanMotion: 0,
      segments: seg,
    });
    const bad = ok.slice();
    new DataView(bad.buffer).setUint16(48, 7, true);
    expect(() => readEphemeris(bad.buffer)).toThrow(/kind 7/);
    const v1 = ok.slice();
    new DataView(v1.buffer).setUint16(4, 1, true);
    expect(() => readEphemeris(v1.buffer)).toThrow(/header/);
  });
});

describe("element segments on perturbed orbits against a numerical reference", () => {
  const t0 = 8.0e8; // TDB s, 2025-05: M - n t must stay well conditioned this far from J2000

  it("VN-EPH-011, VN-EPH-003: a low polar lunar orbit with J2 (LRO-like) fits within 2 km", () => {
    const s0 = initialState(R_MOON + 100, 0.02, 89.7 * DEG, 0.4, 1.0, 0.2);
    const c = sampleOrbit(j2Accel, s0, t0, 60, 1);
    const r = fitAndCheck(c, 7200, 13);
    expect(r.worst).toBeLessThan(2); // km, the low lunar orbit tolerance
    expect(r.worstVel).toBeLessThan(2e-3); // km/s
  });

  it("VN-EPH-011, VN-EPH-003: an eccentric lunar orbit perturbed by Earth (e = 0.6) fits within 2 km with 12 h segments", () => {
    const s0 = initialState(6000, 0.6, 60 * DEG, 1.0, 2.0, 0.5);
    const c = sampleOrbit(thirdBodyAccel, s0, t0, 300, 6);
    const r = fitAndCheck(c, 43200, 12);
    expect(r.worst).toBeLessThan(2);
    // Element segments are why VN-EPH-011 exists: at the same size, position segments miss badly.
    expect(r.worstPos).toBeGreaterThan(10 * r.worst);
  });

  it("VN-EPH-011: L = M - n t stays slowly varying (the fitted sixth component changes far less than M)", () => {
    const s0 = initialState(6000, 0.6, 60 * DEG, 1.0, 2.0, 0.5);
    const c = sampleOrbit(thirdBodyAccel, s0, t0, 600, 1);
    const n = Math.sqrt(MU_MOON / 6000 ** 3);
    const L = elementSeries(c.times, c.states, MU_MOON, n)[ELEMENT_L]!;
    const spread = Math.max(...L) - Math.min(...L);
    expect(spread).toBeLessThan(0.05 * n * 86400);
  });
});

describe("element files in the runtime ephemeris", () => {
  function setup() {
    const s0 = initialState(R_MOON + 100, 0.02, 89.7 * DEG, 0.4, 1.0, 0.2);
    const c = sampleOrbit(j2Accel, s0, 0, 60, 0.5);
    const { bytes } = fitAndCheck(c, 7200, 13);
    const f = readEphemeris(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const line = (id: number, center: number, x: number) =>
      writeEphemeris({
        objectId: id,
        centerId: center,
        degree: 1,
        segments: [{ t0: f.start, t1: f.end, coeffs: [x, 0, 0, 0, 0, 0] }],
      });
    const files = new Map([
      ["-85/0.bin", bytes],
      ["301/0.bin", line(301, 399, 384_400)],
      ["399/0.bin", line(399, 10, 1.496e8)],
    ]);
    const cov = { start: f.start, end: f.end };
    const loader: ChunkLoader = async (file) => files.get(file)!;
    const e = createEphemeris(
      {
        objects: [
          { id: 10, name: "Sun", origin: true },
          { id: 399, name: "Earth", center: 10, chunks: [{ file: "399/0.bin", coverage: cov }] },
          { id: 301, name: "Moon", center: 399, chunks: [{ file: "301/0.bin", coverage: cov }] },
          { id: -85, name: "LRO", center: 301, chunks: [{ file: "-85/0.bin", coverage: cov }] },
        ],
      },
      loader,
    );
    return { e, f, c };
  }

  it("VN-EPH-009: an orbiter stored relative to the Moon composes through Moon and Earth to the Sun", async () => {
    const { e, f, c } = setup();
    const t = c.times[31]!;
    await e.load(t);
    const rel = new Float64Array(6);
    const helio = new Float64Array(6);
    expect(e.relativeState(-85, t, rel)).toBe("ok");
    expect(e.state(-85, t, helio)).toBe("ok");
    expect(helio[0]).toBeCloseTo(1.496e8 + 384_400 + rel[0]!, 6);
    expect(helio[1]).toBeCloseTo(rel[1]!, 9);
    const direct = new Float64Array(6);
    evaluateFile(f, t, direct);
    expect([...rel]).toEqual([...direct]);
    const s = c.states[31]!;
    expect(Math.hypot(rel[0]! - s[0]!, rel[1]! - s[1]!, rel[2]! - s[2]!)).toBeLessThan(2);
  });

  it("VN-EPH-005: evaluating an element segment allocates nothing in steady state", async () => {
    const { e, f } = setup();
    await e.load(f.start);
    const out = new Float64Array(6);
    const span = f.end - f.start;
    for (let i = 0; i < 1_000_000; i++) e.state(-85, f.start + (i % 9973) * (span / 9973), out);
    let gcs = 0;
    const obs = new PerformanceObserver((list) => {
      gcs += list.getEntries().length;
    });
    obs.observe({ entryTypes: ["gc"] });
    await new Promise((r) => setTimeout(r, 20));
    gcs = 0;
    for (let i = 0; i < 1_000_000; i++) e.state(-85, f.start + (i % 9973) * (span / 9973), out);
    await new Promise((r) => setTimeout(r, 20));
    obs.disconnect();
    expect(gcs).toBe(0);
  });
});
