// VN-EPH-004: the binary ephemeris file. Layout in docs/EPHEMERIS_FORMAT.md; any change here bumps FORMAT_VERSION
// and updates that document in the same task. All values little-endian.

export const MAGIC = "VNEP";
export const FORMAT_VERSION = 1;
export const HEADER_BYTES = 64;
export const SEGMENT_ENTRY_BYTES = 16;
const COMPONENTS = 3;

export interface SegmentInput {
  /** TDB seconds since J2000. */
  t0: number;
  t1: number;
  /** COMPONENTS x (degree + 1) coefficients, x then y then z. */
  coeffs: ArrayLike<number>;
}

export interface EphemerisInput {
  /** Horizons ID of the object and of the centre its states are relative to. */
  objectId: number;
  centerId: number;
  degree: number;
  segments: SegmentInput[];
}

export interface EphemerisFile {
  objectId: number;
  centerId: number;
  degree: number;
  segmentCount: number;
  start: number;
  end: number;
  t0: Float64Array;
  t1: Float64Array;
  /** segmentCount x COMPONENTS x (degree + 1), segment-major. */
  coeffs: Float64Array;
}

function checkSegments(t0: ArrayLike<number>, t1: ArrayLike<number>, count: number): void {
  for (let i = 0; i < count; i++) {
    if (!(t1[i]! > t0[i]!)) throw new RangeError(`segment ${i} is empty or reversed`);
    if (i > 0 && t0[i] !== t1[i - 1]) throw new RangeError(`segments ${i - 1} and ${i} are not contiguous`);
  }
}

export function writeEphemeris(input: EphemerisInput): Uint8Array {
  const { degree, segments } = input;
  const n = degree + 1;
  const count = segments.length;
  if (count === 0) throw new RangeError("no segments");
  if (!Number.isInteger(degree) || degree < 0 || degree > 0xffff) throw new RangeError(`bad degree ${degree}`);
  segments.forEach((s, i) => {
    if (s.coeffs.length !== COMPONENTS * n) {
      throw new RangeError(`segment ${i} has ${s.coeffs.length} coefficients, expected ${COMPONENTS * n}`);
    }
  });
  checkSegments(
    segments.map((s) => s.t0),
    segments.map((s) => s.t1),
    count,
  );
  const tableOffset = HEADER_BYTES;
  const coeffOffset = tableOffset + count * SEGMENT_ENTRY_BYTES;
  const total = coeffOffset + count * COMPONENTS * n * 8;
  const bytes = new Uint8Array(total);
  const dv = new DataView(bytes.buffer);
  for (let i = 0; i < 4; i++) bytes[i] = MAGIC.charCodeAt(i);
  dv.setUint16(4, FORMAT_VERSION, true);
  dv.setUint16(6, HEADER_BYTES, true);
  dv.setInt32(8, input.objectId, true);
  dv.setInt32(12, input.centerId, true);
  dv.setUint16(16, degree, true);
  dv.setUint16(18, COMPONENTS, true);
  dv.setUint32(20, count, true);
  dv.setFloat64(24, segments[0]!.t0, true);
  dv.setFloat64(32, segments[count - 1]!.t1, true);
  dv.setUint32(40, tableOffset, true);
  dv.setUint32(44, coeffOffset, true);
  // 48..63 reserved, zero.
  let p = coeffOffset;
  segments.forEach((s, i) => {
    dv.setFloat64(tableOffset + i * SEGMENT_ENTRY_BYTES, s.t0, true);
    dv.setFloat64(tableOffset + i * SEGMENT_ENTRY_BYTES + 8, s.t1, true);
    for (let k = 0; k < s.coeffs.length; k++, p += 8) dv.setFloat64(p, s.coeffs[k]!, true);
  });
  return bytes;
}

/** Reads a file from `buffer` (optionally a slice of it). Throws RangeError naming what is wrong. */
export function readEphemeris(buffer: ArrayBufferLike, byteOffset = 0, byteLength?: number): EphemerisFile {
  const length = byteLength ?? buffer.byteLength - byteOffset;
  if (length < HEADER_BYTES) throw new RangeError(`ephemeris length ${length} is shorter than the header`);
  const dv = new DataView(buffer, byteOffset, length);
  for (let i = 0; i < 4; i++) {
    if (dv.getUint8(i) !== MAGIC.charCodeAt(i)) throw new RangeError("not an ephemeris file (bad magic)");
  }
  const version = dv.getUint16(4, true);
  if (version !== FORMAT_VERSION) {
    throw new RangeError(`ephemeris format version ${version} is not supported (expected ${FORMAT_VERSION})`);
  }
  const degree = dv.getUint16(16, true);
  const components = dv.getUint16(18, true);
  if (components !== COMPONENTS) throw new RangeError(`ephemeris has ${components} components, expected 3`);
  const count = dv.getUint32(20, true);
  const tableOffset = dv.getUint32(40, true);
  const coeffOffset = dv.getUint32(44, true);
  const n = degree + 1;
  const expected = coeffOffset + count * COMPONENTS * n * 8;
  if (tableOffset + count * SEGMENT_ENTRY_BYTES > coeffOffset || expected !== length) {
    throw new RangeError(`ephemeris length ${length} does not match its header (expected ${expected})`);
  }
  const t0 = new Float64Array(count);
  const t1 = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    t0[i] = dv.getFloat64(tableOffset + i * SEGMENT_ENTRY_BYTES, true);
    t1[i] = dv.getFloat64(tableOffset + i * SEGMENT_ENTRY_BYTES + 8, true);
  }
  checkSegments(t0, t1, count);
  const start = dv.getFloat64(24, true);
  const end = dv.getFloat64(32, true);
  if (count > 0 && (start !== t0[0] || end !== t1[count - 1])) {
    throw new RangeError("ephemeris coverage does not match its segment table");
  }
  const coeffs = new Float64Array(count * COMPONENTS * n);
  for (let k = 0; k < coeffs.length; k++) coeffs[k] = dv.getFloat64(coeffOffset + k * 8, true);
  return {
    objectId: dv.getInt32(8, true),
    centerId: dv.getInt32(12, true),
    degree,
    segmentCount: count,
    start,
    end,
    t0,
    t1,
    coeffs,
  };
}

/** Index of the segment holding TDB time t (t1 of the last segment included), or -1 outside coverage. */
export function findSegment(file: EphemerisFile, t: number): number {
  const { t0, t1, segmentCount } = file;
  if (segmentCount === 0 || !(t >= t0[0]!) || !(t <= t1[segmentCount - 1]!)) return -1;
  let lo = 0;
  let hi = segmentCount - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t0[mid]! <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
