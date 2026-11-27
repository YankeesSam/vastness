import { MAX_DISTANCE_KM, MAX_ELEVATION, MIN_DISTANCE_KM } from "../camera/orbit";
import { PLANET_COVERAGE, RATE_LADDER } from "../time/clock";
import { formatUtc, parseUtc } from "../time/scales";

// VN-UI-002, VN-WEB-002: the view state as a URL fragment, so a link reopens the same view. The fragment never
// reaches a server. It is versioned (v=1 first), compact and readable:
//
//   v=1&t=2026-01-01T12:34:56.789Z&r=86400&p=1&s=-31&c=399,1200000,30,-25&l=bmo
//
//   t  simulation time, UTC to the millisecond         r  rate, simulation seconds per real second
//   p  1 paused, 0 playing                                s  selected object (Horizons ID), empty for none
//   c  camera: target ID, distance km, azimuth and elevation in degrees
//   l  layers that are on: b bodies, l labels, m markers, o orbits, t trails
//
// Decoding checks each field on its own and drops what does not pass, so a damaged link still opens what it can.
// A different or missing version gives nothing.

export const FRAGMENT_VERSION = 1;

/** Longest fragment decoded; anything longer is not ours. */
const MAX_LENGTH = 512;

export type FragmentLayer = "bodies" | "labels" | "markers" | "orbits" | "trails";

const LAYER_LETTERS: readonly [FragmentLayer, string][] = [
  ["bodies", "b"],
  ["labels", "l"],
  ["markers", "m"],
  ["orbits", "o"],
  ["trails", "t"],
];

export interface FragmentCamera {
  target: number;
  distanceKm: number;
  /** rad */
  azimuth: number;
  /** rad */
  elevation: number;
}

export interface ViewFragment {
  /** TDB seconds since J2000. */
  t: number;
  rate: number;
  paused: boolean;
  selection: number | null;
  cam: FragmentCamera | null;
  layers: Record<FragmentLayer, boolean>;
}

const DEG = Math.PI / 180;
const MAX_RATE = RATE_LADDER[RATE_LADDER.length - 1]!.rate;

/** Shortest decimal that keeps `digits` significant digits. */
const sig = (x: number, digits: number): string => String(Number(x.toPrecision(digits)));
const deg = (rad: number): string => String(Number((rad / DEG).toFixed(5)));

export function encodeFragment(v: ViewFragment): string {
  const parts = [`v=${FRAGMENT_VERSION}`, `t=${formatUtc(v.t, 3)}`, `r=${sig(v.rate, 12)}`];
  parts.push(`p=${v.paused ? 1 : 0}`);
  parts.push(`s=${v.selection ?? ""}`);
  if (v.cam) {
    const c = v.cam;
    parts.push(`c=${c.target},${sig(c.distanceKm, 7)},${deg(c.azimuth)},${deg(c.elevation)}`);
  }
  parts.push(
    `l=${LAYER_LETTERS.filter(([k]) => v.layers[k])
      .map(([, l]) => l)
      .join("")}`,
  );
  return parts.join("&");
}

function fields(s: string): Map<string, string> | null {
  const raw = s.startsWith("#") ? s.slice(1) : s;
  if (raw.length === 0 || raw.length > MAX_LENGTH) return null;
  const out = new Map<string, string>();
  for (const pair of raw.split("&")) {
    const i = pair.indexOf("=");
    if (i <= 0) continue;
    try {
      out.set(pair.slice(0, i), decodeURIComponent(pair.slice(i + 1)));
    } catch {
      return null;
    }
  }
  return out;
}

const INT = /^-?\d{1,10}$/;

/** The fields of `s` that pass, keyed as in ViewFragment. `known` says whether an object ID exists. */
export function decodeFragment(s: string, known: (id: number) => boolean): Partial<ViewFragment> {
  const f = fields(s);
  if (!f || f.get("v") !== String(FRAGMENT_VERSION)) return {};
  const out: Partial<ViewFragment> = {};

  const t = f.get("t");
  if (t !== undefined) {
    try {
      const v = parseUtc(t.replace(/Z$/, ""));
      // the millisecond rounding at an edge may land just outside; a second of slack, then held to the edge
      if (v >= PLANET_COVERAGE.start - 1 && v <= PLANET_COVERAGE.end + 1) {
        out.t = Math.min(PLANET_COVERAGE.end, Math.max(PLANET_COVERAGE.start, v));
      }
    } catch {
      // dropped
    }
  }

  const r = Number(f.get("r"));
  if (f.has("r") && Number.isFinite(r) && Math.abs(r) <= MAX_RATE) out.rate = r;

  const p = f.get("p");
  if (p === "1" || p === "0") out.paused = p === "1";

  const sel = f.get("s");
  if (sel === "") out.selection = null;
  else if (sel !== undefined && INT.test(sel) && known(Number(sel))) out.selection = Number(sel);

  const c = f.get("c")?.split(",");
  if (c && c.length === 4 && INT.test(c[0]!)) {
    const [target, d, az, el] = c.map(Number) as [number, number, number, number];
    if (
      known(target) &&
      Number.isFinite(d) &&
      d >= MIN_DISTANCE_KM &&
      d <= MAX_DISTANCE_KM &&
      Number.isFinite(az) &&
      Number.isFinite(el)
    ) {
      const elevation = Math.min(MAX_ELEVATION, Math.max(-MAX_ELEVATION, el * DEG));
      out.cam = { target, distanceKm: d, azimuth: az * DEG, elevation };
    }
  }

  const l = f.get("l");
  if (l !== undefined && /^[a-z]{0,10}$/.test(l)) {
    out.layers = Object.fromEntries(LAYER_LETTERS.map(([k, letter]) => [k, l.includes(letter)])) as Record<
      FragmentLayer,
      boolean
    >;
  }
  return out;
}
