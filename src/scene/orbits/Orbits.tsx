import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, Line, ShaderMaterial, Vector3 } from "three";
import { viewStore } from "../../app/store/view";
import type { Ephemeris } from "../../core/ephem/ephemeris";
import { sceneFromEcliptic } from "../../core/frames";
import {
  createOrbitSamples,
  needsResample,
  ORBIT_PERIOD_DAYS,
  orbitWindow,
  sampleOrbit,
  splitDouble,
  type Evaluate,
  type OrbitSamples,
  type OrbitWindow,
} from "../../core/orbits/sample";
import type { BodyFrame } from "../bodies/Bodies";
import { DRAWN_BODIES } from "../bodies/positions";
import { colourOf } from "../colours";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";

// VN-SCN-002: orbit paths for the planets (heliocentric) and the Moon (about Earth, drawn around Earth's current
// position). VN-SCN-004: vertices are relative-to-eye encoded (high and low float32 parts); the anchor minus the
// camera is taken in float64 on the CPU and split the same way, so a 30 AU path stays exact near the camera.
//
// Data (VN-SCN-002, VN-EPH-006): every sample is ephemeris data from Horizons; nothing is approximated. Until the first
// frame has every body placed, paths use chunks already in memory only (peek), so they never delay the first render
// (VN-PRF-004); after that they load the chunks they need (about 2 MB more for the outer planets) and fill in as they
// arrive. A period that would run past the coverage is slid inside it.

const DAY = 86400;

const vertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 low;
attribute float alpha;
uniform vec3 offHigh;
uniform vec3 offLow;
varying float vAlpha;
void main() {
  vec3 rel = (position + offHigh) + (low + offLow);
  vAlpha = alpha;
  gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const fragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 color;
varying float vAlpha;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(color, vAlpha);
  #include <colorspace_fragment>
}
`;

interface Track {
  index: number;
  id: number;
  /** Index in DRAWN_BODIES of the body the path is drawn around (-1: the frame origin). */
  anchor: number;
  periodS: number;
  coverage: { start: number; end: number } | null;
  window: OrbitWindow;
  samples: OrbitSamples;
  evaluate: Evaluate;
  line: Line<BufferGeometry, ShaderMaterial>;
  high: Float32Array;
  low: Float32Array;
}

/** Whether orbit samples may request chunks yet (after the first complete frame). */
interface LoadGate {
  open: boolean;
}

function makeEvaluate(eph: Ephemeris, id: number, gate: LoadGate): Evaluate {
  const st = new Float64Array(6);
  const scene = new Float64Array(3);
  const write = (out: Float64Array, o: number) => {
    sceneFromEcliptic(st, scene);
    out[o] = scene[0]!;
    out[o + 1] = scene[1]!;
    out[o + 2] = scene[2]!;
    return true;
  };
  // The Moon about Earth, as stored (geocentric); its 27-day path lies in the chunks loaded for now.
  if (id === 301) return (t, out, o) => eph.relativeState(301, t, st) === "ok" && write(out, o);
  return (t, out, o) => (gate.open ? eph.state(id, t, st) : eph.peek(id, t, st)) === "ok" && write(out, o);
}

export function Orbits({ eph, frame }: { eph: Ephemeris | null; frame: BodyFrame }) {
  const rig = useRig();
  const canvas = useThree((s) => s.gl.domElement);

  const gate = useMemo<LoadGate>(() => ({ open: false }), []);
  const tracks = useMemo<Track[]>(() => {
    if (!eph) return [];
    const out: Track[] = [];
    DRAWN_BODIES.forEach((b, index) => {
      const days = ORBIT_PERIOD_DAYS[b.horizonsId];
      if (!days) return;
      const samples = createOrbitSamples();
      const high = new Float32Array(3 * samples.n);
      const low = new Float32Array(3 * samples.n);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(high, 3));
      geometry.setAttribute("low", new BufferAttribute(low, 3));
      geometry.setAttribute("alpha", new BufferAttribute(samples.alpha, 1));
      const material = new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          offHigh: { value: new Vector3() },
          offLow: { value: new Vector3() },
          color: { value: new Color(colourOf(b.horizonsId)) },
        },
        transparent: true,
        depthWrite: false,
      });
      const line = new Line(geometry, material);
      line.frustumCulled = false;
      line.visible = false;
      line.name = `orbit-${b.name}`;
      out.push({
        index,
        id: b.horizonsId,
        anchor: b.horizonsId === 301 ? DRAWN_BODIES.findIndex((d) => d.horizonsId === 399) : -1,
        periodS: days * DAY,
        coverage: eph.has(b.horizonsId) ? eph.coverage(b.horizonsId) : null,
        window: { t0: 0, span: 0 },
        samples,
        evaluate: makeEvaluate(eph, b.horizonsId, gate),
        line,
        high,
        low,
      });
    });
    return out;
  }, [eph, gate]);

  useEffect(
    () => () => {
      for (const tr of tracks) {
        tr.line.geometry.dispose();
        tr.line.material.dispose();
      }
    },
    [tracks],
  );

  const split = useMemo(() => new Float32Array(2), []);

  useFrame(() => {
    const st = viewStore.getState();
    if (!gate.open) {
      let all = 1;
      for (let i = 0; i < frame.ok.length; i++) all &= frame.ok[i]!;
      gate.open = all === 1; // the first frame with every body placed has been drawn: now the paths may load
    }
    let complete = 0;
    for (const tr of tracks) {
      const s = tr.samples;
      const cov = tr.coverage;
      // VN-EPH-006: no data for now, no orbit.
      if (!cov || !orbitWindow(st.t, tr.periodS, cov.start, cov.end, tr.window)) {
        tr.line.visible = false;
        continue;
      }
      if (needsResample(s, st.t)) {
        sampleOrbit(tr.evaluate, st.t, tr.periodS, s, tr.window);
        for (let i = 0; i < 3 * s.n; i++) {
          splitDouble(s.pos[i]!, split, 0);
          tr.high[i] = split[0]!;
          tr.low[i] = split[1]!;
        }
        for (let i = 0; i < s.n; i++) if (!s.ok[i]) s.alpha[i] = 0;
        const g = tr.line.geometry;
        g.getAttribute("position").needsUpdate = true;
        g.getAttribute("low").needsUpdate = true;
        g.getAttribute("alpha").needsUpdate = true;
      }
      if (s.missing === 0) complete++;
      const a = tr.anchor;
      const anchored = a < 0 || frame.ok[a] === 1;
      tr.line.visible = st.layers.orbits && anchored && s.missing < s.n;
      if (!tr.line.visible) continue;
      const u = tr.line.material.uniforms;
      const hi = u.offHigh!.value as Vector3;
      const lo = u.offLow!.value as Vector3;
      for (let k = 0; k < 3; k++) {
        const off = (a < 0 ? 0 : frame.world[3 * a + k]!) - rig.cam[k]!; // float64 on the CPU
        splitDouble(off, split, 0);
        hi.setComponent(k, split[0]!);
        lo.setComponent(k, split[1]!);
      }
    }
    // For e2e specs: how many orbits have every sample.
    const c = String(complete);
    if (canvas.dataset.orbits !== c) canvas.dataset.orbits = c;
  }, PRIORITY.objects);

  return (
    <>
      {tracks.map((tr) => (
        <primitive key={tr.index} object={tr.line} />
      ))}
    </>
  );
}
