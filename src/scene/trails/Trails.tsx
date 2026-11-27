import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, Line, ShaderMaterial, Vector3 } from "three";
import { CATALOG_BY_ID } from "../../app/catalog";
import { useView, viewStore } from "../../app/store/view";
import { QUALITY } from "../../core/quality";
import type { Ephemeris } from "../../core/ephem/ephemeris";
import { sceneFromEcliptic } from "../../core/frames";
import { splitDouble, type Evaluate } from "../../core/orbits/sample";
import {
  createTrailSamples,
  sampleTrail,
  trailRange,
  trailStale,
  type TrailRange,
  type TrailSamples,
} from "../../core/trails/sample";
import type { BodyFrame } from "../bodies/Bodies";
import { SCENE_OBJECTS } from "../bodies/positions";
import { useRig } from "../rig";
import { PRIORITY } from "../Scene";

// VN-CAT-004: spacecraft trails, sampled by curvature from the ephemeris (src/core/trails). The part before the
// simulation time is solid and the predicted part after it dashed (dashes in time, so they do not crawl as the camera
// moves), over the range in the view store. Relative-to-eye vertices as for the orbits (VN-SCN-004, ADR-0004).
// Like the orbits, trails read only chunks in memory until the first complete frame, then load what they need.

const vertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 low;
attribute float u;
uniform vec3 offHigh;
uniform vec3 offLow;
varying float vU;
void main() {
  vec3 rel = (position + offHigh) + (low + offLow);
  vU = u;
  gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0);
  #include <logdepthbuf_vertex>
}
`;

// u: time from now over the range on that side, -1 (oldest) .. 0 (now) .. 1 (farthest prediction).
const fragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 color;
varying float vU;
void main() {
  #include <logdepthbuf_fragment>
  if (vU > 0.0 && fract(vU * 48.0) > 0.55) discard;
  float a = vU > 0.0 ? 0.75 - 0.35 * vU : 0.85 - 0.6 * (-vU);
  gl_FragColor = vec4(color, a);
  #include <colorspace_fragment>
}
`;

interface Trail {
  index: number;
  id: number;
  coverage: { start: number; end: number } | null;
  range: TrailRange;
  samples: TrailSamples;
  evaluate: Evaluate;
  line: Line<BufferGeometry, ShaderMaterial>;
  high: Float32Array;
  low: Float32Array;
  u: Float32Array;
}

export function Trails({ eph, frame }: { eph: Ephemeris | null; frame: BodyFrame }) {
  const rig = useRig();
  const canvas = useThree((s) => s.gl.domElement);
  const gate = useMemo(() => ({ open: false }), []);
  // VN-PRF-003: the tier sets each trail's point budget
  const points = useView((s) => QUALITY[s.quality].trailPoints);

  const trails = useMemo<Trail[]>(() => {
    if (!eph) return [];
    const out: Trail[] = [];
    SCENE_OBJECTS.forEach((o, index) => {
      if (o.kind !== "spacecraft" || !eph.has(o.id)) return;
      const samples = createTrailSamples(points);
      const high = new Float32Array(3 * samples.capacity);
      const low = new Float32Array(3 * samples.capacity);
      const u = new Float32Array(samples.capacity);
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(high, 3));
      geometry.setAttribute("low", new BufferAttribute(low, 3));
      geometry.setAttribute("u", new BufferAttribute(u, 1));
      geometry.setDrawRange(0, 0);
      const material = new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          offHigh: { value: new Vector3() },
          offLow: { value: new Vector3() },
          color: { value: new Color(CATALOG_BY_ID.get(o.id)?.colour ?? "#ffffff") },
        },
        transparent: true,
        depthWrite: false,
      });
      const line = new Line(geometry, material);
      line.frustumCulled = false;
      line.visible = false;
      line.name = `trail-${o.name}`;
      const st = new Float64Array(6);
      const sc = new Float64Array(3);
      const evaluate: Evaluate = (t, p, k) => {
        if ((gate.open ? eph.state(o.id, t, st) : eph.peek(o.id, t, st)) !== "ok") return false;
        sceneFromEcliptic(st, sc);
        p[k] = sc[0]!;
        p[k + 1] = sc[1]!;
        p[k + 2] = sc[2]!;
        return true;
      };
      out.push({
        index,
        id: o.id,
        coverage: eph.coverage(o.id),
        range: { t0: 0, now: 0, t1: 0 },
        samples,
        evaluate,
        line,
        high,
        low,
        u,
      });
    });
    return out;
  }, [eph, gate, points]);

  useEffect(
    () => () => {
      for (const tr of trails) {
        tr.line.geometry.dispose();
        tr.line.material.dispose();
      }
    },
    [trails],
  );

  const split = useMemo(() => new Float32Array(2), []);
  const off = useMemo(() => new Float64Array(3), []);

  useFrame(() => {
    const st = viewStore.getState();
    if (!gate.open) {
      let all = 1;
      for (let i = 0; i < frame.ok.length; i++) all &= frame.ok[i]! | frame.outside[i]!;
      gate.open = all === 1;
    }
    let shown = 0;
    for (const tr of trails) {
      const cov = tr.coverage;
      if (!st.layers.trails || !cov || !trailRange(st.t, st.trailDays, st.trailDays, cov, tr.range)) {
        tr.line.visible = false;
        continue;
      }
      const s = tr.samples;
      if (trailStale(s, tr.range)) {
        sampleTrail(tr.evaluate, tr.range, s);
        // World positions as high and low float32 parts; the camera offset goes in the uniforms.
        const r = tr.range;
        const back = r.now - r.t0 || 1;
        const ahead = r.t1 - r.now || 1;
        for (let i = 0; i < s.count; i++) {
          for (let k = 0; k < 3; k++) {
            splitDouble(s.pos[3 * i + k]!, split, 0);
            tr.high[3 * i + k] = split[0]!;
            tr.low[3 * i + k] = split[1]!;
          }
          const dt = s.t[i]! - r.now;
          tr.u[i] = dt < 0 ? dt / back : dt / ahead;
        }
        const g = tr.line.geometry;
        g.setDrawRange(0, s.count);
        g.getAttribute("position").needsUpdate = true;
        g.getAttribute("low").needsUpdate = true;
        g.getAttribute("u").needsUpdate = true;
      }
      tr.line.visible = s.count > 1;
      if (!tr.line.visible) continue;
      shown++;
      const u = tr.line.material.uniforms;
      const hi = u.offHigh!.value as Vector3;
      const lo = u.offLow!.value as Vector3;
      for (let k = 0; k < 3; k++) {
        off[k] = -rig.cam[k]!; // float64 on the CPU
        splitDouble(off[k]!, split, 0);
        hi.setComponent(k, split[0]!);
        lo.setComponent(k, split[1]!);
      }
    }
    // For e2e specs: how many trails are drawn.
    const c = String(shown);
    if (canvas.dataset.trails !== c) canvas.dataset.trails = c;
  }, PRIORITY.objects);

  return (
    <>
      {trails.map((tr) => (
        <primitive key={tr.index} object={tr.line} />
      ))}
    </>
  );
}
