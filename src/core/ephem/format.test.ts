import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateSegment } from "./chebyshev";
import {
  FORMAT_VERSION,
  POSITION_FILE_VERSION,
  HEADER_BYTES,
  MAGIC,
  SEGMENT_ENTRY_BYTES,
  findSegment,
  readEphemeris,
  writeEphemeris,
  type EphemerisInput,
} from "./format";

const degree = 2;
const n = degree + 1;
/** Three segments over [0, 30] with x = 10 * segment + tau, y = 1, z = -tau^2 style coefficients. */
function sample(): EphemerisInput {
  return {
    objectId: -31,
    centerId: 10,
    degree,
    segments: [0, 1, 2].map((s) => ({
      t0: s * 10,
      t1: (s + 1) * 10,
      coeffs: Float64Array.from([10 * s, 1, 0, 1, 0, 0, -0.5, 0, -0.5]),
    })),
  };
}

describe("binary ephemeris format", () => {
  it("VN-EPH-004: header holds magic, version, object, centre, degree, segment count and coverage, little-endian", () => {
    const bytes = writeEphemeris(sample());
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe(MAGIC);
    expect(dv.getUint16(4, true)).toBe(POSITION_FILE_VERSION);
    expect(dv.getUint16(6, true)).toBe(HEADER_BYTES);
    expect(dv.getInt32(8, true)).toBe(-31);
    expect(dv.getInt32(12, true)).toBe(10);
    expect(dv.getUint16(16, true)).toBe(degree);
    expect(dv.getUint16(18, true)).toBe(3);
    expect(dv.getUint32(20, true)).toBe(3);
    expect(dv.getFloat64(24, true)).toBe(0);
    expect(dv.getFloat64(32, true)).toBe(30);
    const tableOffset = dv.getUint32(40, true);
    const coeffOffset = dv.getUint32(44, true);
    expect(tableOffset).toBe(HEADER_BYTES);
    expect(coeffOffset).toBe(HEADER_BYTES + 3 * SEGMENT_ENTRY_BYTES);
    expect(coeffOffset % 8).toBe(0);
    expect(dv.getFloat64(tableOffset + SEGMENT_ENTRY_BYTES, true)).toBe(10); // segment 1 t0
    expect(dv.getFloat64(coeffOffset + 3 * n * 8, true)).toBe(10); // segment 1 x0
    expect(bytes.byteLength).toBe(coeffOffset + 3 * 3 * n * 8);
  });

  it("VN-EPH-004: write then read round-trips every value exactly and the output is deterministic", () => {
    const input = sample();
    const bytes = writeEphemeris(input);
    expect(writeEphemeris(sample())).toEqual(bytes);
    const file = readEphemeris(bytes.slice().buffer);
    expect(file.objectId).toBe(-31);
    expect(file.centerId).toBe(10);
    expect(file.degree).toBe(degree);
    expect(file.segmentCount).toBe(3);
    expect([file.start, file.end]).toEqual([0, 30]);
    expect(Array.from(file.t0)).toEqual([0, 10, 20]);
    expect(Array.from(file.t1)).toEqual([10, 20, 30]);
    expect(Array.from(file.coeffs)).toEqual(input.segments.flatMap((s) => Array.from(s.coeffs)));
  });

  it("VN-EPH-004: reads from a buffer at a non-zero offset (no text parsing, no alignment assumption)", () => {
    const bytes = writeEphemeris(sample());
    const padded = new Uint8Array(bytes.byteLength + 3);
    padded.set(bytes, 3);
    const file = readEphemeris(padded.buffer, 3, bytes.byteLength);
    expect(file.coeffs[3 * n]).toBe(10);
  });

  it("VN-EPH-004: segment lookup by binary search and evaluation through the read file", () => {
    const file = readEphemeris(writeEphemeris(sample()).buffer);
    expect(findSegment(file, -0.1)).toBe(-1);
    expect(findSegment(file, 0)).toBe(0);
    expect(findSegment(file, 9.999)).toBe(0);
    expect(findSegment(file, 10)).toBe(1);
    expect(findSegment(file, 29.5)).toBe(2);
    expect(findSegment(file, 30)).toBe(2); // the end of coverage belongs to the last segment
    expect(findSegment(file, 30.1)).toBe(-1);
    const out = new Float64Array(6);
    const i = findSegment(file, 25);
    evaluateSegment(file.coeffs, i * 3 * n, n, file.t0[i]!, file.t1[i]!, 25, out, 0);
    expect(out[0]).toBeCloseTo(20 + 0, 14); // tau = 0 at the segment midpoint
    expect(out[1]).toBe(1);
  });

  it("VN-EPH-004: rejects bad magic, an unknown version, truncation and gaps, naming the problem", () => {
    const good = writeEphemeris(sample());
    const bad = (mutate: (b: Uint8Array, dv: DataView) => Uint8Array | void) => {
      const b = good.slice();
      const r = mutate(b, new DataView(b.buffer)) ?? b;
      return () => readEphemeris(r.buffer, r.byteOffset, r.byteLength);
    };
    expect(
      bad((b) => {
        b[0] = 0x58;
      }),
    ).toThrow(/magic/);
    expect(bad((_, dv) => dv.setUint16(4, FORMAT_VERSION + 1, true))).toThrow(/version 4/);
    expect(bad((b) => b.subarray(0, b.byteLength - 8))).toThrow(/length/);
    expect(bad((_, dv) => dv.setFloat64(HEADER_BYTES + SEGMENT_ENTRY_BYTES, 10.5, true))).toThrow(/contiguous/);
    expect(() => writeEphemeris({ ...sample(), degree: 3 })).toThrow(RangeError);
    const gap = sample();
    gap.segments[1] = { ...gap.segments[1]!, t0: 11 };
    expect(() => writeEphemeris(gap)).toThrow(/contiguous/);
  });

  it("VN-DOC-003: docs/EPHEMERIS_FORMAT.md documents this version, every header field, the manifest and the fit", () => {
    const doc = readFileSync(new URL("../../../docs/EPHEMERIS_FORMAT.md", import.meta.url), "utf8");
    expect(doc).toContain(`Format version: ${FORMAT_VERSION}`);
    expect(doc).toContain(`"${MAGIC}"`);
    for (const field of [
      "magic",
      "version",
      "header_bytes",
      "object_id",
      "center_id",
      "degree",
      "components",
      "segment_count",
      "coverage_start",
      "coverage_end",
      "segment_table_offset",
      "coefficients_offset",
      "kind",
      "mu",
      "mean_motion",
    ]) {
      expect(doc).toContain(`\`${field}\``);
    }
    expect(doc).toMatch(/## Manifest/);
    expect(doc).toMatch(/## Fitting method/);
  });
});
