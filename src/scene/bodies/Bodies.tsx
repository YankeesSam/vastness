import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh, PointLight } from "three";
import { viewStore } from "../../app/store/view";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";
import { colourOf } from "../colours";
import { DRAWN_BODIES } from "./positions";

// VN-SCN-001: plain spheres with true mean radii at their ephemeris positions, placed camera-relative each frame
// (the world positions come from the shared frame buffer the rig fills).

export interface BodyFrame {
  /** World positions of DRAWN_BODIES this frame, 3 per body. */
  readonly world: Float64Array;
  /** 1 where the body has a position this frame. */
  readonly ok: Uint8Array;
}

export function createBodyFrame(): BodyFrame {
  return { world: new Float64Array(3 * DRAWN_BODIES.length), ok: new Uint8Array(DRAWN_BODIES.length) };
}

export function Bodies({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const meshes = useRef<(Mesh | null)[]>([]);
  const light = useRef<PointLight>(null);
  const rel = useMemo(() => new Float64Array(3), []);
  const show = useRef(viewStore.getState().layers.bodies);

  useFrame(() => {
    show.current = viewStore.getState().layers.bodies;
    for (let i = 0; i < DRAWN_BODIES.length; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      m.visible = show.current && frame.ok[i] === 1;
      if (!frame.ok[i]) continue;
      toCamera(frame.world, rig.cam, rel, 3 * i);
      m.position.set(rel[0]!, rel[1]!, rel[2]!);
      if (i === 0 && light.current) light.current.position.copy(m.position);
    }
  }, PRIORITY.objects);

  return (
    <>
      <ambientLight intensity={0.04} />
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
            <meshBasicMaterial color={colourOf(10)} />
          ) : (
            <meshLambertMaterial color={colourOf(b.horizonsId)} />
          )}
        </mesh>
      ))}
    </>
  );
}
