import { CATALOG } from "../../app/catalog";
import { BODIES, type Body } from "../../core/constants";
import type { Ephemeris } from "../../core/ephem/ephemeris";
import { sceneFromEcliptic } from "../../core/frames";

// VN-SCN-001, VN-CAT-006: the objects in the scene and their float64 world positions (scene frame, km) for a time.
// Bodies come first (drawn as spheres, in DRAWN_BODIES order), then the catalog's spacecraft (markers only), then its
// Earth satellites (markers near Earth, VN-CAT-007).

/** Sun, planets in order from the Sun, the Moon after Earth. */
export const DRAWN_BODIES: readonly Body[] = [10, 199, 299, 399, 301, 499, 599, 699, 799, 899].map(
  (id) => BODIES[id as keyof typeof BODIES],
);

/** A spacecraft's nominal size for the camera (closest approach, framing), km. Models are T-044. */
export const SPACECRAFT_RADIUS_KM = 0.005;

export interface SceneObject {
  id: number;
  name: string;
  radiusKm: number;
  kind: "body" | "spacecraft" | "satellite";
}

export const SCENE_OBJECTS: readonly SceneObject[] = [
  ...DRAWN_BODIES.map((b) => ({ id: b.horizonsId, name: b.name, radiusKm: b.radiusKm, kind: "body" as const })),
  ...CATALOG.objects
    .filter((o) => o.type === "spacecraft")
    .map((o) => ({ id: o.id, name: o.name, radiusKm: SPACECRAFT_RADIUS_KM, kind: "spacecraft" as const })),
  ...CATALOG.objects
    .filter((o) => o.type === "satellite")
    .map((o) => ({ id: o.id, name: o.name, radiusKm: SPACECRAFT_RADIUS_KM, kind: "satellite" as const })),
];

export function objectIndex(id: number | null): number {
  return id === null ? -1 : SCENE_OBJECTS.findIndex((o) => o.id === id);
}

const state = new Float64Array(6);
const scene = new Float64Array(3);

/**
 * World positions of SCENE_OBJECTS at TDB time t into out (3 per object); ok[i] is 1 where the ephemeris gave a
 * state; outside[i] is 1 where it has none to give (not in the ephemeris, or t outside its coverage, VN-EPH-007).
 * VN-EPH-011: an orbiter outside its stored span with an illustrative orbit is placed on that orbit, ok[i] 1 and
 * illustrative[i] 1, never at an exact position. Returns how many were ok. Allocates nothing.
 */
export function worldPositions(
  eph: Ephemeris,
  t: number,
  out: Float64Array,
  ok: Uint8Array,
  outside?: Uint8Array,
  illustrative?: Uint8Array,
): number {
  let n = 0;
  for (let i = 0; i < SCENE_OBJECTS.length; i++) {
    const id = SCENE_OBJECTS[i]!.id;
    let st = eph.has(id) ? eph.state(id, t, state) : "outside";
    let ill = 0;
    if (st === "outside" && id < 0 && eph.has(id)) {
      const s2 = eph.illustrative(id, t, state);
      if (s2 !== "outside") {
        st = s2;
        ill = 1;
      }
    }
    if (illustrative) illustrative[i] = ill;
    if (outside) outside[i] = st === "outside" ? 1 : 0;
    if (st === "ok") {
      sceneFromEcliptic(state, scene);
      out[3 * i] = scene[0]!;
      out[3 * i + 1] = scene[1]!;
      out[3 * i + 2] = scene[2]!;
      ok[i] = 1;
      n++;
    } else ok[i] = 0;
  }
  return n;
}
