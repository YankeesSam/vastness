import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments } from "three";
import { CATALOG_BY_ID } from "../../app/catalog";
import { viewStore } from "../../app/store/view";
import { BODIES } from "../../core/constants";
import { activity, distanceAu, dustTail, ionTailDirection } from "../../core/comets/tail";
import type { Ephemeris } from "../../core/ephem/ephemeris";
import { sceneFromEcliptic } from "../../core/frames";
import type { BodyFrame } from "../bodies/Bodies";
import { SCENE_OBJECTS } from "../bodies/positions";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";

// T-107 (VN-EXT-015): comet tails with the comets layer. Per comet a straight ion tail along the solar wind relative
// to the comet (blue) and a fan of dust syndynes (beta 0.25, 0.5 and 1: heavier grains lag more) curving behind the
// orbit (the comet's colour). Lengths and brightness follow core/comets/tail.ts: the ion tail and the opacity scale
// with activity (1/r^2, none beyond 5 au); the dust tail's length follows radiation pressure, also 1/r^2. All comets
// share one LineSegments draw call; offsets are computed in float64 and only the camera-relative result goes to the
// GPU (ADR-0004). Illustrative: tails are drawn from a model, not observed.

/** Ion tail length at 1 au (activity 1), km; real ion tails run 10 to 100 million km. */
export const ION_TAIL_KM_AT_1AU = 3e7;
/** Ion tail length never exceeds this, km (activity is capped at 4, inside 0.5 au). */
const ACTIVITY_CAP = 4;
/** Age of the oldest drawn dust, s. */
const DUST_AGE_S = 30 * 86400;
const DUST_BETAS = [0.25, 0.5, 1] as const;
/** Points per tail polyline. */
const N = 16;
const TAILS = 1 + DUST_BETAS.length;
const SEGMENTS = TAILS * (N - 1);
const ION_COLOUR = new Color("#8fc8ff");
const MU_SUN = BODIES[10].gmKm3S2;

const COMETS = SCENE_OBJECTS.map((o, i) => ({ ...o, i })).filter((o) => o.kind === "comet");

export function CometTails({ eph, frame }: { eph: Ephemeris | null; frame: BodyFrame }) {
  const rig = useRig();
  const canvas = useThree((t) => t.gl.domElement);
  const lines = useMemo(() => {
    const geometry = new BufferGeometry();
    const verts = COMETS.length * SEGMENTS * 2;
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(3 * verts), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(4 * verts), 4));
    geometry.setDrawRange(0, 0);
    const material = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    const l = new LineSegments(geometry, material);
    l.name = "comet-tails";
    l.frustumCulled = false;
    l.visible = false;
    l.renderOrder = 5;
    return l;
  }, []);
  useEffect(
    () => () => {
      lines.geometry.dispose();
      lines.material.dispose();
    },
    [lines],
  );
  const s = useMemo(
    () => ({
      state: new Float64Array(6),
      ion: new Float64Array(3),
      ecl: new Float64Array(3),
      sc: new Float64Array(3),
      base: new Float64Array(3),
      poly: new Float64Array(3 * N),
      colours: COMETS.map((c) => new Color(CATALOG_BY_ID.get(c.id)?.colour ?? "#ffffff")),
    }),
    [],
  );

  useFrame(() => {
    const st = viewStore.getState();
    const on = st.layers.comets && eph !== null;
    lines.visible = on;
    if (!on) {
      if (canvas.dataset.cometTails !== "0") canvas.dataset.cometTails = "0";
      return;
    }
    const pos = lines.geometry.getAttribute("position") as BufferAttribute;
    const col = lines.geometry.getAttribute("color") as BufferAttribute;
    const P = pos.array as Float32Array;
    const C = col.array as Float32Array;
    let v = 0;
    let drawn = 0;
    // One polyline (N points, ecliptic offsets from the nucleus in s.poly) into the segment buffer, fading out.
    const emit = (colour: Color, alpha: number) => {
      for (let k = 0; k < N - 1; k++) {
        for (const j of [k, k + 1]) {
          s.ecl[0] = s.poly[3 * j]!;
          s.ecl[1] = s.poly[3 * j + 1]!;
          s.ecl[2] = s.poly[3 * j + 2]!;
          sceneFromEcliptic(s.ecl, s.sc);
          P[3 * v] = s.base[0]! + s.sc[0]!;
          P[3 * v + 1] = s.base[1]! + s.sc[1]!;
          P[3 * v + 2] = s.base[2]! + s.sc[2]!;
          C[4 * v] = colour.r;
          C[4 * v + 1] = colour.g;
          C[4 * v + 2] = colour.b;
          C[4 * v + 3] = alpha * (1 - j / (N - 1));
          v++;
        }
      }
    };
    for (let c = 0; c < COMETS.length; c++) {
      const i = COMETS[c]!.i;
      if (!frame.ok[i] || eph.peek(COMETS[c]!.id, st.t, s.state) !== "ok") continue;
      const a = Math.min(activity(distanceAu(s.state)), ACTIVITY_CAP);
      if (a <= 0) continue;
      drawn++;
      toCamera(frame.world, rig.cam, s.base, 3 * i, 0);
      const alpha = Math.min(1, 0.25 + 0.35 * a);
      // Ion tail: straight, along the solar wind relative to the comet.
      ionTailDirection(s.state, s.state.subarray(3), s.ion);
      const len = ION_TAIL_KM_AT_1AU * a;
      for (let k = 0; k < N; k++) {
        const f = (len * k) / (N - 1);
        s.poly[3 * k] = s.ion[0]! * f;
        s.poly[3 * k + 1] = s.ion[1]! * f;
        s.poly[3 * k + 2] = s.ion[2]! * f;
      }
      emit(ION_COLOUR, alpha);
      for (const beta of DUST_BETAS) {
        dustTail(s.state, s.state.subarray(3), MU_SUN, beta, DUST_AGE_S, s.poly, N);
        emit(s.colours[c]!, alpha * 0.8);
      }
    }
    lines.geometry.setDrawRange(0, v);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    // For e2e specs: how many comets have tails this frame.
    const d = String(drawn);
    if (canvas.dataset.cometTails !== d) canvas.dataset.cometTails = d;
  }, PRIORITY.objects);

  return <primitive object={lines} />;
}
