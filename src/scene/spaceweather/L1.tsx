import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Mesh, MeshBasicMaterial, RingGeometry } from "three";
import { spaceWeatherCache } from "../../app/assets/spaceweather";
import { viewStore } from "../../app/store/view";
import { VERTICAL_FOV_DEG } from "../../core/camera/presets";
import { l1Position } from "../../core/spaceweather/l1";
import { windAt } from "../../core/spaceweather/model";
import type { BodyFrame } from "../bodies/Bodies";
import { objectIndex } from "../bodies/positions";
import { toCamera } from "../origin";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";

// T-102 (VN-EXT-007): the Sun-Earth L1 point, where SWPC's solar wind is measured: a small diamond, bright while
// the time shown is inside the span SWPC served at build time (the values are in the space weather panel), dim
// outside it. Drawn on the true Sun-Earth line, 1.5 million km sunward of Earth's drawn position.

const SUN = 0;
const EARTH = objectIndex(399);
const FOV = (VERTICAL_FOV_DEG * Math.PI) / 180;

export function L1Marker({ frame }: { frame: BodyFrame }) {
  const rig = useRig();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const mesh = useMemo(() => {
    const m = new Mesh(
      new RingGeometry(0.55, 1, 4),
      new MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }),
    );
    m.name = "l1";
    m.frustumCulled = false;
    m.renderOrder = 12;
    m.visible = false;
    return m;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
    [mesh],
  );
  const s = useMemo(() => ({ truth: new Float64Array(3), drawn: new Float64Array(3), rel: new Float64Array(3) }), []);

  useFrame(() => {
    const st = viewStore.getState();
    const sw = spaceWeatherCache.current;
    const on = st.layers.spaceweather && sw !== null && frame.ok[SUN] === 1 && frame.ok[EARTH] === 1;
    mesh.visible = on;
    if (!on) return;
    l1Position(frame.truth, frame.truth, s.truth, 3 * SUN, 3 * EARTH);
    // offset from Earth's drawn position by the true L1 offset (Earth may be pushed in exaggerated scale)
    for (let k = 0; k < 3; k++) s.drawn[k] = frame.world[3 * EARTH + k]! + s.truth[k]! - frame.truth[3 * EARTH + k]!;
    toCamera(s.drawn, rig.cam, s.rel);
    const d = Math.hypot(s.rel[0]!, s.rel[1]!, s.rel[2]!);
    mesh.position.set(s.rel[0]!, s.rel[1]!, s.rel[2]!);
    mesh.quaternion.copy(camera.quaternion);
    mesh.scale.setScalar((7 * 2 * d * Math.tan(FOV / 2)) / Math.max(1, size.height));
    mesh.material.opacity = windAt(sw, st.t) ? 0.95 : 0.35;
  }, PRIORITY.objects);

  return <primitive object={mesh} />;
}
