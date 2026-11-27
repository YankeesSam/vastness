import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, Line, ShaderMaterial, Vector3 } from "three";
import { viewStore } from "../../app/store/view";
import type { Ephemeris } from "../../core/ephem/ephemeris";
import { approxPlanetState, type PlanetId } from "../../core/ephem/kepler-approx";
import { sceneFromEcliptic } from "../../core/frames";
import {
  createOrbitSamples,
  needsResample,
  ORBIT_PERIOD_DAYS,
  sampleOrbit,
  splitDouble,
  type Evaluate,
  type OrbitSamples,
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
// Data: within LOAD_WINDOW_S of now the samples come from the ephemeris and may load its chunks; further out they
// come from chunks already in memory, else from the approximate elements (VN-EPH-006), so one Neptune orbit does
// not pull 165 years (about 4 MB for the outer planets) of chunks into the page.

/** Orbit samples this close to the current time may load ephemeris chunks, s (one year). */
export const LOAD_WINDOW_S = 365.25 * 86400;

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
  /** Index in DRAWN_BODIES of the body the path is drawn around (-1: the frame origin). */
  anchor: number;
  periodS: number;
  samples: OrbitSamples;
  evaluate: Evaluate;
  line: Line<BufferGeometry, ShaderMaterial>;
  high: Float32Array;
  low: Float32Array;
  /** The time `evaluate` treats as now. */
  now: { t: number };
}

function makeEvaluate(eph: Ephemeris, id: number, now: { t: number }): Evaluate {
  const st = new Float64Array(6);
  const parent = new Float64Array(6);
  if (id === 301) {
    // The Moon about Earth: a 27-day path, always inside the load window.
    return (t, out, o) => {
      if (eph.state(301, t, st) !== "ok" || eph.state(399, t, parent) !== "ok") return false;
      for (let k = 0; k < 3; k++) st[k] = st[k]! - parent[k]!;
      sceneFromEcliptic(st, parent);
      out[o] = parent[0]!;
      out[o + 1] = parent[1]!;
      out[o + 2] = parent[2]!;
      return true;
    };
  }
  const scene = new Float64Array(3);
  return (t, out, o) => {
    const near = Math.abs(t - now.t) <= LOAD_WINDOW_S;
    const s = near ? eph.state(id, t, st) : eph.peek(id, t, st);
    if (s !== "ok" && (near || !approxPlanetState(id as PlanetId, t, st))) return false;
    sceneFromEcliptic(st, scene);
    out[o] = scene[0]!;
    out[o + 1] = scene[1]!;
    out[o + 2] = scene[2]!;
    return true;
  };
}

export function Orbits({ eph, frame }: { eph: Ephemeris | null; frame: BodyFrame }) {
  const rig = useRig();
  const canvas = useThree((s) => s.gl.domElement);

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
      const now = { t: viewStore.getState().t };
      out.push({
        index,
        anchor: b.horizonsId === 301 ? DRAWN_BODIES.findIndex((d) => d.horizonsId === 399) : -1,
        periodS: days * DAY,
        samples,
        evaluate: makeEvaluate(eph, b.horizonsId, now),
        line,
        high,
        low,
        now,
      });
    });
    return out;
  }, [eph]);

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
    let complete = 0;
    for (const tr of tracks) {
      const s = tr.samples;
      if (needsResample(s, st.t)) {
        tr.now.t = st.t;
        sampleOrbit(tr.evaluate, st.t, tr.periodS, s);
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
