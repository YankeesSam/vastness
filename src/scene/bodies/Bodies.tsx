import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  type Mesh,
  type PointLight,
} from "three";
import { sceneFromEcliptic } from "../../core/frames";
import { saturnPole } from "../../core/rings";
import { eclipsePossible } from "../../core/shadow";
import { useView, viewStore } from "../../app/store/view";
import { QUALITY } from "../../core/quality";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";
import { colourOf } from "../colours";
import { BodyTextures, radiusPx, wantTexture } from "./materials";
import { bodyMeshMatrix } from "./orient";
import { ringLookup, shadowedLambert, shadowUniforms } from "./shadow";
import { DRAWN_BODIES, SCENE_OBJECTS } from "./positions";

// VN-SCN-009: each body is oriented and spins by its IAU rotation model (orient.ts).
// VN-SCN-005: the Sun is the only light (a point light at its drawn position, no ambient light), so each body is lit
// from the Sun's direction and its night side is dark. VN-SCN-001: plain spheres with true mean radii (scaled by the scale mapping, VN-SCL-002) at their drawn positions, placed camera-relative each frame
// (the world positions come from the shared frame buffer the rig fills).

export interface BodyFrame {
  /** True world positions of SCENE_OBJECTS this frame, 3 per object (bodies first, in DRAWN_BODIES order). */
  readonly truth: Float64Array;
  /** Drawn world positions (the scale mapping of truth, VN-SCL-002); everything drawn or framed uses these. */
  readonly world: Float64Array;
  /** Drawn radii, km (VN-SCL-002). */
  readonly radius: Float64Array;
  /** VN-SCL-003: the scale amount this frame, 0 true to 1 exaggerated (animated by a switch). */
  readonly scale: { amount: number };
  /** 1 where the object has a position this frame. */
  readonly ok: Uint8Array;
  /** 1 where the object has no position to load at this time (outside its coverage, VN-EPH-007). */
  readonly outside: Uint8Array;
  /** 1 where an orbiter is drawn on its illustrative orbit, outside its stored span (VN-EPH-011). */
  readonly illustrative: Uint8Array;
}

export function createBodyFrame(): BodyFrame {
  const n = SCENE_OBJECTS.length;
  return {
    truth: new Float64Array(3 * n),
    world: new Float64Array(3 * n),
    radius: Float64Array.from(SCENE_OBJECTS, (o) => o.radiusKm),
    scale: { amount: 0 },
    ok: new Uint8Array(n),
    outside: new Uint8Array(n),
    illustrative: new Uint8Array(n),
  };
}

/** VN-SCN-005: the Sun's emissive disc, near white (the catalog colour stays for its marker and label). */
const SUN_DISC = "#fff3d6";

/** VN-SCN-010: the drawn bodies that can shadow each body (DRAWN_BODIES indices): Earth and the Moon each other. */
const EARTH = DRAWN_BODIES.findIndex((b) => b.horizonsId === 399);
const MOON = DRAWN_BODIES.findIndex((b) => b.horizonsId === 301);
const SATURN = DRAWN_BODIES.findIndex((b) => b.horizonsId === 699);
const OCCLUDERS: readonly (readonly number[])[] = DRAWN_BODIES.map((_, i) =>
  i === EARTH ? [MOON] : i === MOON ? [EARTH] : [],
);

/** Each body's plain colour (VN-SCN-001), shown until its map is in. */
const plain = DRAWN_BODIES.map((b) => new Color(colourOf(b.horizonsId)));

export function Bodies({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const meshes = useRef<(Mesh | null)[]>([]);
  const light = useRef<PointLight>(null);
  const rel = useMemo(() => new Float64Array(3), []);
  const show = useRef(viewStore.getState().layers.bodies);
  const turn = useMemo(() => new Matrix4(), []);
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  // VN-SCN-006: surface maps on demand, edge capped by the quality tier (VN-PRF-003)
  const edge = useView((s) => QUALITY[s.quality].textureSize);
  const maps = useMemo(() => new BodyTextures(edge, () => invalidate()), [edge, invalidate]);
  useEffect(() => () => maps.dispose(), [maps]);
  const white = useMemo(() => new Color("#ffffff"), []);
  // VN-SCN-010: per body the shadow uniforms its material reads (the Sun's disc is not shadowed)
  const shadows = useMemo(() => DRAWN_BODIES.map(() => shadowUniforms()), []);
  const materials = useMemo(
    () =>
      DRAWN_BODIES.map((b, i) =>
        b.horizonsId === 10
          ? new MeshBasicMaterial({ color: SUN_DISC, toneMapped: false })
          : shadowedLambert(shadows[i]!, colourOf(b.horizonsId)),
      ),
    [shadows],
  );
  const ringLook = useMemo(() => ringLookup(), []);
  useEffect(
    () => () => {
      for (const m of materials) m.dispose();
      ringLook.dispose();
    },
    [materials, ringLook],
  );
  const pole = useMemo(() => ({ ecl: new Float64Array(3), scene: new Float64Array(3) }), []);

  useFrame(() => {
    const st = viewStore.getState();
    show.current = st.layers.bodies;
    for (let i = 0; i < DRAWN_BODIES.length; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      m.visible = show.current && frame.ok[i] === 1;
      if (!frame.ok[i]) continue;
      toCamera(frame.world, rig.cam, rel, 3 * i);
      m.position.set(rel[0]!, rel[1]!, rel[2]!);
      m.scale.setScalar(frame.radius[i]! / DRAWN_BODIES[i]!.radiusKm); // VN-SCL-002
      // VN-SCN-009: turned by the IAU rotation model at the simulation time
      if (bodyMeshMatrix(DRAWN_BODIES[i]!.horizonsId, st.t, turn)) m.quaternion.setFromRotationMatrix(turn);
      // VN-SCN-006: the map while the body is big enough on screen and the layer is on; else its plain colour
      const id = DRAWN_BODIES[i]!.horizonsId;
      const fov = camera instanceof PerspectiveCamera ? camera.fov : 50;
      const px = radiusPx(frame.radius[i]!, Math.hypot(rel[0]!, rel[1]!, rel[2]!), fov, canvas.clientHeight || 800);
      maps.want(id, m.visible && st.layers.textures && wantTexture(px, maps.get(id) !== null));
      const mat = m.material;
      if (mat instanceof MeshLambertMaterial) {
        const map = st.layers.textures ? maps.get(id) : null;
        if (mat.map !== map) {
          mat.map = map;
          mat.color.copy(map ? white : plain[i]!);
          mat.needsUpdate = true;
        }
      }
      if (i === 0 && light.current) light.current.position.copy(m.position);
    }
    // VN-SCN-010: eclipse shadows from the drawn Sun, occluders and rings (camera-relative, as the meshes)
    const sun = meshes.current[0];
    for (let i = 1; i < DRAWN_BODIES.length; i++) {
      const u = shadows[i]!;
      const m = meshes.current[i];
      if (!m || !m.visible || !sun) continue;
      u.shadowSun.value.set(sun.position.x, sun.position.y, sun.position.z, frame.radius[0]!);
      const occ = OCCLUDERS[i]!;
      for (let k = 0; k < 2; k++) {
        const v = k === 0 ? u.shadowOcc0.value : u.shadowOcc1.value;
        const j = occ[k];
        const o = j === undefined ? null : meshes.current[j];
        // VN-PRF-002: only while an eclipse is geometrically possible (two short seasons a year)
        if (
          j !== undefined &&
          o &&
          o.visible &&
          eclipsePossible(
            frame.world.subarray(3 * i, 3 * i + 3),
            frame.radius[i]!,
            frame.world.subarray(0, 3),
            frame.radius[0]!,
            frame.world.subarray(3 * j, 3 * j + 3),
            frame.radius[j]!,
          )
        )
          v.set(o.position.x, o.position.y, o.position.z, frame.radius[j]!);
        else v.w = 0;
      }
      if (i === SATURN) {
        u.shadowRingOn.value = 1;
        u.shadowRingCentre.value.copy(m.position);
        sceneFromEcliptic(saturnPole(st.t, pole.ecl), pole.scene);
        u.shadowRingPole.value.set(pole.scene[0]!, pole.scene[1]!, pole.scene[2]!);
        u.shadowRingScale.value = frame.radius[i]! / DRAWN_BODIES[i]!.radiusKm;
        u.shadowRingLookup.value = ringLook;
      }
    }
    // For e2e specs: which bodies have their map in.
    const held = maps.held().join(",");
    if (canvas.dataset.surfaces !== held) canvas.dataset.surfaces = held;
  }, PRIORITY.objects);

  return (
    <>
      <pointLight ref={light} intensity={3} decay={0} />
      {DRAWN_BODIES.map((b, i) => (
        <mesh
          key={b.horizonsId}
          name={b.name}
          visible={false}
          ref={(m) => {
            meshes.current[i] = m;
          }}
        >
          <sphereGeometry args={[b.radiusKm, 64, 32]} />
          <primitive object={materials[i]!} attach="material" />
        </mesh>
      ))}
    </>
  );
}
