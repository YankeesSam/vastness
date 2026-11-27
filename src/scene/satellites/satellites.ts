import type { CatalogObject } from "../../core/catalog/schema";
import type { Ephemeris, EvalStatus, ManifestChunk } from "../../core/ephem/ephemeris";
import { stateToElements } from "../../core/ephem/elements";
import { edgeFor, illustrativeState, type Illustrative, type IllustrativeEdge } from "../../core/ephem/illustrative";
import { WGS72, fromOmm, initialize, propagate, type Omm, type Satrec } from "../../core/sgp4/sgp4";
import { temeToJ2000 } from "../../core/sgp4/teme";
import { SECONDS_PER_DAY, parseUtc, ttFromTdb } from "../../core/time/scales";

// VN-CAT-007, ADR-0007: the Earth satellite layer. Each satellite is propagated with SGP4 from its build-time GP
// elements (data/satellites.json), turned from TEME into the J2000 ecliptic and placed relative to Earth. Within 14
// days of the element epoch it is drawn at that position; beyond, on an illustrative orbit (the two-body ellipse of
// the osculating elements at 14 days, VN-EPH-011), never at an extrapolated exact position. `withSatellites` adds
// them to the ephemeris as Earth-centred objects, so positions, picking, fly-to and the info panel treat them like
// any orbiter. Pure (no three.js, no DOM); propagation allocates nothing.

/** GP elements are drawn exactly only this close to their epoch. */
export const VALID_DAYS = 14;
/** Satellite markers are shown while the camera is this close to Earth (beyond the Moon's orbit). */
export const SATELLITE_NEAR_KM = 1e6;
const EARTH = 399;

export interface SatelliteTrack {
  id: number;
  norad: number;
  name: string;
  /** Element epoch, TDB seconds since J2000, and its ISO UTC text. */
  epoch: number;
  epochIso: string;
  sat: Satrec;
  /** Drawn exactly over [epoch - 14 d, epoch + 14 d]. */
  coverage: { start: number; end: number };
  illustrative: Illustrative;
}

export interface SatellitesData {
  satellites: Array<{ id: number; norad: number; name: string; epoch: string; omm: Omm }>;
}

const scratch = new Float64Array(6);

/** Earth-centred J2000 ecliptic state (km, km/s) from SGP4 at t; false where SGP4 reports an error (decay). */
function sgp4State(sat: Satrec, epoch: number, t: number, out: Float64Array, o: number): boolean {
  if (propagate(sat, (t - epoch) / 60, out, o) !== 0) return false;
  temeToJ2000(out, ttFromTdb(t) / (36525 * SECONDS_PER_DAY), true, o);
  return true;
}

function edgeAt(sat: Satrec, epoch: number, t: number, from?: number): IllustrativeEdge | undefined {
  if (!sgp4State(sat, epoch, t, scratch, 0)) return undefined;
  const el = stateToElements(scratch, WGS72.mu);
  const elements = [el[0]!, el[1]!, el[2]!, el[3]!, el[4]!, el[5]!] as const;
  return { t, mu: WGS72.mu, elements, ...(from !== undefined ? { from } : {}) };
}

/** Tracks for the satellites in `data`; `launch` gives the catalog's launch instant (before it nothing is drawn). */
export function satelliteTracks(
  data: SatellitesData,
  launch: (id: number) => number | null = () => null,
): SatelliteTrack[] {
  return data.satellites.map((s) => {
    const epoch = parseUtc(s.epoch.replace(/Z$/, ""));
    const sat = initialize(fromOmm(s.omm));
    const half = VALID_DAYS * SECONDS_PER_DAY;
    const l = launch(s.id);
    const coverage = { start: Math.max(epoch - half, l ?? -Infinity), end: epoch + half };
    const before = coverage.start > (l ?? -Infinity) ? edgeAt(sat, epoch, coverage.start, l ?? undefined) : undefined;
    const after = edgeAt(sat, epoch, coverage.end);
    return {
      id: s.id,
      norad: s.norad,
      name: s.name,
      epoch,
      epochIso: s.epoch,
      sat,
      coverage,
      illustrative: { ...(before ? { before } : {}), ...(after ? { after } : {}) },
    };
  });
}

/** Launch instants from the catalog, for satelliteTracks. */
export function launchFrom(byId: ReadonlyMap<number, Pick<CatalogObject, "launch">>): (id: number) => number | null {
  return (id) => {
    const l = byId.get(id)?.launch;
    return l ? parseUtc(l) : null;
  };
}

/**
 * The ephemeris with the satellites added as Earth-centred objects. Their states need Earth's: loading a satellite
 * loads Earth's chunks. Everything else is passed through unchanged.
 */
export function withSatellites(eph: Ephemeris, tracks: readonly SatelliteTrack[]): Ephemeris {
  const byId = new Map(tracks.map((s) => [s.id, s]));
  const earth = new Float64Array(6);
  const ids = [...eph.ids, ...byId.keys()].sort((a, b) => a - b);
  const baseIds = (list: readonly number[] | undefined): readonly number[] | undefined => {
    if (!list) return undefined;
    const out = list.filter((id) => !byId.has(id));
    if (out.length < list.length && !out.includes(EARTH)) out.push(EARTH);
    return out;
  };
  const rel = (s: SatelliteTrack, t: number, out: Float64Array, o: number): EvalStatus =>
    t >= s.coverage.start && t <= s.coverage.end && sgp4State(s.sat, s.epoch, t, out, o) ? "ok" : "outside";
  const compose = (s: SatelliteTrack, t: number, out: Float64Array, o: number, peek: boolean): EvalStatus => {
    const st = rel(s, t, out, o);
    if (st !== "ok") return st;
    const e = peek ? eph.peek(EARTH, t, earth) : eph.state(EARTH, t, earth);
    if (e !== "ok") return e;
    for (let k = 0; k < 6; k++) out[o + k] = out[o + k]! + earth[k]!;
    return "ok";
  };
  return {
    ids,
    has: (id) => byId.has(id) || eph.has(id),
    name: (id) => byId.get(id)?.name ?? eph.name(id),
    center: (id) => (byId.has(id) ? EARTH : eph.center(id)),
    coverage: (id) => byId.get(id)?.coverage ?? eph.coverage(id),
    chunksAt: (t, list): ManifestChunk[] => eph.chunksAt(t, baseIds(list)),
    load: (t, list) => eph.load(t, baseIds(list)),
    relativeState(id, t, out, o = 0) {
      const s = byId.get(id);
      return s ? rel(s, t, out, o) : eph.relativeState(id, t, out, o);
    },
    state(id, t, out, o = 0) {
      const s = byId.get(id);
      return s ? compose(s, t, out, o, false) : eph.state(id, t, out, o);
    },
    peek(id, t, out, o = 0) {
      const s = byId.get(id);
      return s ? compose(s, t, out, o, true) : eph.peek(id, t, out, o);
    },
    illustrativeEdge(id, t) {
      const s = byId.get(id);
      return s ? edgeFor(s.illustrative, s.coverage, t) : eph.illustrativeEdge(id, t);
    },
    illustrative(id, t, out, o = 0) {
      const s = byId.get(id);
      if (!s) return eph.illustrative(id, t, out, o);
      const edge = edgeFor(s.illustrative, s.coverage, t);
      if (!edge) return "outside";
      const e = eph.state(EARTH, t, earth);
      if (e !== "ok") return e;
      illustrativeState(edge, t, out, o);
      for (let k = 0; k < 6; k++) out[o + k] = out[o + k]! + earth[k]!;
      return "ok";
    },
  };
}

/** VN-CAT-007: the panel's line on the elements' age at time t, e.g. "2026-11-26 22:39 UTC, 3.2 days before". */
export function elementsAge(track: Pick<SatelliteTrack, "epoch" | "epochIso">, t: number): string {
  const days = (t - track.epoch) / SECONDS_PER_DAY;
  const when = `${track.epochIso.slice(0, 10)} ${track.epochIso.slice(11, 16)} UTC`;
  const a = Math.abs(days);
  const amount = a < 1 / 24 ? "less than an hour" : a < 1 ? `${(a * 24).toFixed(0)} h` : `${a.toFixed(1)} days`;
  if (a < 1 / 24) return `${when}, ${amount} from the time shown`;
  return `${when}, ${amount} ${days > 0 ? "before" : "after"} the time shown`;
}

/** Whether a satellite marker is shown: the camera near Earth, or the satellite selected. */
export function satelliteShown(cameraToEarthKm: number, selected: boolean): boolean {
  return selected || cameraToEarthKm <= SATELLITE_NEAR_KM;
}
