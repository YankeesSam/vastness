import { evaluateSegment } from "./chebyshev.ts";
import { findSegment, readEphemeris, type EphemerisFile } from "./format.ts";

// VN-EPH-005, VN-EPH-009, VN-EPH-010: the runtime ephemeris. It reads the manifest's chunk index, loads chunk files
// through an injected loader (the app passes its own-origin asset loader; tests pass files from disk), evaluates
// Chebyshev segments into caller-supplied arrays without allocating, and composes parent-relative objects (the Moon
// relative to Earth) into heliocentric states. Missing chunks are requested lazily and reported as "loading".

export interface ManifestChunk {
  file: string;
  coverage: { start: number; end: number };
  bytes?: number;
}

export interface ManifestObject {
  id: number;
  name: string;
  origin?: boolean;
  center?: number;
  chunks?: ManifestChunk[];
}

export interface EphemerisManifest {
  objects: ManifestObject[];
}

/** Loads one chunk file by its manifest path (relative to the ephemeris directory). */
export type ChunkLoader = (file: string) => Promise<ArrayBuffer | Uint8Array>;

/** "ok" wrote a state; "loading" the chunk is on its way (requested now if it was not); "outside" no coverage. */
export type EvalStatus = "ok" | "loading" | "outside" | "error";

const EMPTY = 0;
const PENDING = 1;
const LOADED = 2;
const FAILED = 3;

interface ChunkSlot {
  file: string;
  start: number;
  end: number;
  bytes: number;
  state: number;
  data: EphemerisFile | null;
  promise: Promise<void> | null;
  error: unknown;
}

interface Body {
  id: number;
  name: string;
  origin: boolean;
  /** Index of the parent body in `bodies`, -1 for the origin. */
  parent: number;
  chunks: ChunkSlot[];
  /** Scratch for composing this body's parent state. */
  scratch: Float64Array;
}

export interface Ephemeris {
  /** Horizons IDs in the manifest, ascending. */
  readonly ids: readonly number[];
  has(id: number): boolean;
  name(id: number): string;
  /** Horizons ID of the centre the stored states are relative to, or null for the origin. */
  center(id: number): number | null;
  /** Union of the chunk coverage, TDB seconds since J2000; null for the origin. */
  coverage(id: number): { start: number; end: number } | null;
  /** Chunks of `ids` (default all) whose coverage contains t, with their parents' chunks. */
  chunksAt(t: number, ids?: readonly number[]): ManifestChunk[];
  /** Loads every chunk `chunksAt(t, ids)` names; resolves when they are all in memory. */
  load(t: number, ids?: readonly number[]): Promise<void>;
  /** State relative to the stored centre: x, y, z km, vx, vy, vz km/s into out[offset..offset+5]. */
  relativeState(id: number, t: number, out: Float64Array, offset?: number): EvalStatus;
  /** Heliocentric (frame origin) state, composed through the parent chain (VN-EPH-009). */
  state(id: number, t: number, out: Float64Array, offset?: number): EvalStatus;
}

function findChunk(chunks: readonly ChunkSlot[], t: number): number {
  // Chunks are ascending and contiguous; a time on a boundary belongs to the later chunk.
  let lo = 0;
  let hi = chunks.length - 1;
  if (hi < 0 || !(t >= chunks[0]!.start) || !(t <= chunks[hi]!.end)) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (chunks[mid]!.start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function createEphemeris(manifest: EphemerisManifest, loader: ChunkLoader): Ephemeris {
  const sorted = [...manifest.objects].sort((a, b) => a.id - b.id);
  const index = new Map<number, number>();
  sorted.forEach((o, i) => {
    if (index.has(o.id)) throw new RangeError(`manifest lists object ${o.id} twice`);
    index.set(o.id, i);
  });
  const bodies: Body[] = sorted.map((o) => {
    const chunks: ChunkSlot[] = (o.chunks ?? [])
      .map((c) => ({
        file: c.file,
        start: c.coverage.start,
        end: c.coverage.end,
        bytes: c.bytes ?? 0,
        state: EMPTY,
        data: null,
        promise: null,
        error: null,
      }))
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i]!.start !== chunks[i - 1]!.end) {
        throw new RangeError(`object ${o.id}: chunks ${chunks[i - 1]!.file} and ${chunks[i]!.file} are not contiguous`);
      }
    }
    return { id: o.id, name: o.name, origin: o.origin === true, parent: -1, chunks, scratch: new Float64Array(6) };
  });
  sorted.forEach((o, i) => {
    const b = bodies[i]!;
    if (b.origin) return;
    if (o.center === undefined) throw new RangeError(`object ${o.id} has no centre`);
    const p = index.get(o.center);
    if (p === undefined) throw new RangeError(`object ${o.id}: centre ${o.center} is not in the manifest`);
    b.parent = p;
  });
  // Reject cycles: every chain must reach the origin.
  bodies.forEach((b) => {
    let k = 0;
    for (let p = b.parent; p >= 0; p = bodies[p]!.parent) {
      if (++k > bodies.length) throw new RangeError(`object ${b.id}: centre chain does not reach the origin`);
    }
    if (!b.origin && b.parent < 0) throw new RangeError(`object ${b.id} has no centre`);
  });
  const ids = bodies.map((b) => b.id);

  function body(id: number): Body {
    const i = index.get(id);
    if (i === undefined) throw new RangeError(`unknown object ${id}`);
    return bodies[i]!;
  }

  function request(objectId: number, slot: ChunkSlot): Promise<void> {
    if (slot.promise) return slot.promise;
    slot.state = PENDING;
    slot.promise = loader(slot.file)
      .then((buf) => {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        const f = readEphemeris(u8.buffer, u8.byteOffset, u8.byteLength);
        if (f.objectId !== objectId) throw new RangeError(`${slot.file} holds object ${f.objectId}, not ${objectId}`);
        if (f.start !== slot.start || f.end !== slot.end) {
          throw new RangeError(`${slot.file} coverage does not match the manifest`);
        }
        slot.data = f;
        slot.state = LOADED;
      })
      .catch((e: unknown) => {
        slot.state = FAILED;
        slot.error = e;
        slot.promise = null;
        throw e;
      });
    return slot.promise;
  }

  /** Chunks needed for b at t, itself and its parents, into acc. */
  function collect(b: Body, t: number, acc: Set<ChunkSlot>, owners: Map<ChunkSlot, number>): void {
    for (let x: Body | undefined = b; x && !x.origin; x = x.parent >= 0 ? bodies[x.parent] : undefined) {
      const c = findChunk(x.chunks, t);
      if (c >= 0) {
        acc.add(x.chunks[c]!);
        owners.set(x.chunks[c]!, x.id);
      }
    }
  }

  function relative(b: Body, t: number, out: Float64Array, o: number): EvalStatus {
    if (b.origin) {
      out.fill(0, o, o + 6);
      return "ok";
    }
    const c = findChunk(b.chunks, t);
    if (c < 0) return "outside";
    const slot = b.chunks[c]!;
    if (slot.state !== LOADED) {
      if (slot.state === EMPTY) {
        request(b.id, slot).catch(() => {
          /* reported through the status */
        });
      }
      return slot.state === FAILED ? "error" : "loading";
    }
    const f = slot.data!;
    const s = findSegment(f, t);
    if (s < 0) return "outside";
    const n = f.degree + 1;
    evaluateSegment(f.coeffs, s * 3 * n, n, f.t0[s]!, f.t1[s]!, t, out, o);
    return "ok";
  }

  function compose(b: Body, t: number, out: Float64Array, o: number): EvalStatus {
    const st = relative(b, t, out, o);
    if (st !== "ok" || b.parent < 0) return st;
    const p = bodies[b.parent]!;
    if (p.origin) return "ok";
    const tmp = b.scratch;
    const ps = compose(p, t, tmp, 0);
    if (ps !== "ok") return ps;
    for (let k = 0; k < 6; k++) out[o + k] = out[o + k]! + tmp[k]!;
    return "ok";
  }

  return {
    ids,
    has: (id) => index.has(id),
    name: (id) => body(id).name,
    center: (id) => {
      const b = body(id);
      return b.parent < 0 ? null : bodies[b.parent]!.id;
    },
    coverage: (id) => {
      const b = body(id);
      if (b.chunks.length === 0) return null;
      return { start: b.chunks[0]!.start, end: b.chunks[b.chunks.length - 1]!.end };
    },
    chunksAt(t, which) {
      const acc = new Set<ChunkSlot>();
      const owners = new Map<ChunkSlot, number>();
      for (const id of which ?? ids) collect(body(id), t, acc, owners);
      return [...acc].map((s) => ({ file: s.file, coverage: { start: s.start, end: s.end }, bytes: s.bytes }));
    },
    async load(t, which) {
      const acc = new Set<ChunkSlot>();
      const owners = new Map<ChunkSlot, number>();
      for (const id of which ?? ids) collect(body(id), t, acc, owners);
      await Promise.all([...acc].map((s) => (s.state === LOADED ? undefined : request(owners.get(s)!, s))));
    },
    relativeState: (id, t, out, offset = 0) => relative(body(id), t, out, offset),
    state: (id, t, out, offset = 0) => compose(body(id), t, out, offset),
  };
}
