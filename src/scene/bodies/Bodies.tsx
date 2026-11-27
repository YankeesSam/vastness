import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Matrix4, type Mesh, type PointLight } from "three";
import { viewStore } from "../../app/store/view";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";
import { colourOf } from "../colours";
import { bodyMeshMatrix } from "./orient";
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

export function Bodies({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const meshes = useRef<(Mesh | null)[]>([]);
  const light = useRef<PointLight>(null);
  const rel = useMemo(() => new Float64Array(3), []);
  const show = useRef(viewStore.getState().layers.bodies);
  const turn = useMemo(() => new Matrix4(), []);

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
      if (i === 0 && light.current) light.current.position.copy(m.position);
    }
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
          {b.horizonsId === 10 ? (
            <meshBasicMaterial color={SUN_DISC} toneMapped={false} />
          ) : (
            <meshLambertMaterial color={colourOf(b.horizonsId)} />
          )}
        </mesh>
      ))}
    </>
  );
}
