import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh, PointLight } from "three";
import { viewStore } from "../../app/store/view";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";
import { DRAWN_BODIES } from "./positions";

// VN-SCN-001: plain spheres with true mean radii at their ephemeris positions, placed camera-relative each frame
// (the world positions come from the shared frame buffer the rig fills). Colours are placeholders until the
// catalog carries them.
const COLOURS: Record<number, string> = {
  10: "#ffd27a",
  199: "#9a948c",
  299: "#e3cf9a",
  399: "#4f7fc9",
  301: "#b9b6ae",
  499: "#c1623b",
  599: "#d6b48c",
  699: "#e2cf98",
  799: "#9fd6dc",
  899: "#5577d8",
};

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
            <meshBasicMaterial color={COLOURS[10] ?? "#fff"} />
          ) : (
            <meshLambertMaterial color={COLOURS[b.horizonsId] ?? "#fff"} />
          )}
        </mesh>
      ))}
    </>
  );
}
