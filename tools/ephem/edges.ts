// VN-EPH-011, VN-EPH-007: the illustrative-orbit edges in the manifest. For every orbiter, the osculating elements
// at the end of its stored span (and at the start when only a window around the build is stored, so it was already in
// orbit before), from the stored files themselves; the app draws the two-body ellipse of those elements outside the
// span, labelled illustrative. Pure function of the generated files: deterministic (VN-GEN-010).

import { BODIES, type BodyId } from "../../src/core/constants.ts";
import { evaluateFile } from "../../src/core/ephem/ephemeris.ts";
import { stateToElements } from "../../src/core/ephem/elements.ts";
import { readEphemeris } from "../../src/core/ephem/format.ts";
import type { IllustrativeEdge } from "../../src/core/ephem/illustrative.ts";

interface Orbiter {
  id: number;
  center?: number;
  stored?: string;
  mission?: { coverage?: { start: number } };
  coverage?: { start: number; end: number };
  chunks?: { file: string }[];
  illustrative?: unknown;
  /** T-085: the mission ended by entering its parent (Galileo, Cassini): nothing to draw after its end. */
  ends_in_parent?: boolean;
}

const round = (x: number, digits: number): number => Number(x.toPrecision(digits));

/** Elements at t from a file, or undefined when the state there is not an ellipse about the centre. */
function edgeAt(bytes: Uint8Array, t: number, mu: number): IllustrativeEdge | undefined {
  const f = readEphemeris(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const s = new Float64Array(6);
  if (!evaluateFile(f, t, s)) return undefined;
  let el: Float64Array;
  try {
    el = stateToElements(s, mu);
  } catch {
    return undefined;
  }
  if (!(el[1]! < 1)) return undefined;
  const e = [...el].map((x) => round(x, 15)) as unknown as IllustrativeEdge["elements"];
  return { t, mu, elements: e };
}

/** Adds `illustrative` to each orbiter (an object with a centre other than the Sun and kind spacecraft) in place. */
export function addIllustrativeEdges(objects: unknown[], files: ReadonlyMap<string, Uint8Array>): void {
  for (const raw of objects) {
    const o = raw as Orbiter & { kind?: string };
    if (o.kind !== "spacecraft" || o.center === undefined || o.center === 10 || !o.coverage || !o.chunks?.length) {
      continue;
    }
    const mu = BODIES[o.center as BodyId]?.gmKm3S2;
    if (!mu) continue;
    const last = files.get(o.chunks.at(-1)!.file);
    const first = files.get(o.chunks[0]!.file);
    if (!last || !first) throw new RangeError(`object ${o.id}: chunk files missing for the illustrative edges`);
    const after = o.ends_in_parent ? undefined : edgeAt(last, o.coverage.end, mu);
    const b = o.stored === "window" ? edgeAt(first, o.coverage.start, mu) : undefined;
    const before = b && o.mission?.coverage ? { ...b, from: o.mission.coverage.start } : b;
    if (after || before) o.illustrative = { ...(after ? { after } : {}), ...(before ? { before } : {}) };
  }
}
