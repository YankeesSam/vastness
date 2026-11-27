import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from "three";
import { viewStore } from "../../app/store/view";
import type { BodyFrame } from "../bodies/Bodies";
import { objectIndex } from "../bodies/positions";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";
import { pulseRadiusKm, unitRing } from "./pulse";

// VN-SCL-007: the light-speed pulse in the scene: a faint sphere and a brighter ring in the ecliptic plane, centred on
// the origin's drawn position (camera-relative, float64 difference first) and scaled to the pulse radius each frame.

const COLOUR = 0xfff1b8;

export function LightPulse({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const canvas = useThree((s) => s.gl.domElement);
  const group = useMemo(() => {
    const g = new Group();
    g.name = "light-pulse";
    g.visible = false;
    const sphere = new Mesh(
      new SphereGeometry(1, 64, 32),
      new MeshBasicMaterial({ color: COLOUR, transparent: true, opacity: 0.07, side: DoubleSide, depthWrite: false }),
    );
    const ringGeometry = new BufferGeometry();
    ringGeometry.setAttribute("position", new BufferAttribute(unitRing(512), 3));
    const ring = new LineLoop(
      ringGeometry,
      new LineBasicMaterial({ color: COLOUR, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    for (const o of [sphere, ring]) o.frustumCulled = false;
    g.add(sphere, ring);
    return g;
  }, []);
  useEffect(
    () => () => {
      group.traverse((o) => {
        if (o instanceof Mesh || o instanceof LineLoop) {
          o.geometry.dispose();
          (o.material as MeshBasicMaterial | LineBasicMaterial).dispose();
        }
      });
    },
    [group],
  );
  const rel = useMemo(() => new Float64Array(3), []);

  useFrame(() => {
    const st = viewStore.getState();
    const p = st.pulse;
    const i = p ? objectIndex(p.origin) : -1;
    const r = p ? pulseRadiusKm(p, st.t) : null;
    const on = p !== null && i >= 0 && frame.ok[i] === 1 && r !== null && r > 0;
    group.visible = on;
    if (on) {
      toCamera(frame.world, rig.cam, rel, 3 * i);
      group.position.set(rel[0]!, rel[1]!, rel[2]!);
      group.scale.setScalar(r);
    }
    // For e2e specs: the pulse radius, km (4 significant digits), empty when there is none.
    const d = on ? r.toPrecision(4) : "";
    if (canvas.dataset.pulse !== d) canvas.dataset.pulse = d;
  }, PRIORITY.objects);

  return <primitive object={group} />;
}
