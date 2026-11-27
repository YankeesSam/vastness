import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, Line, ShaderMaterial, Vector3 } from "three";
import { CATALOG_BY_ID } from "../../app/catalog";
import { useView, viewStore } from "../../app/store/view";
import { QUALITY } from "../../core/quality";
import { mapTrail } from "../../core/scale/mapping";
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
import { DRAWN_BODIES, SCALE_TABLE, SCENE_OBJECTS } from "../bodies/positions";
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

/** Frames between retries of a trail whose last sample had positions missing. */
const RETRY_FRAMES = 10;

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
  /** The drawn geometry came from a sample with no positions missing. */
  complete: boolean;
  /** Points in the drawn geometry. */
  drawn: number;
  /** Frames since the last resample that had positions missing. */
  waited: number;
  /** Index of the drawn point at the simulation time it was sampled for. */
  split: number;
  /** The drawn samples (true positions, scene frame km; times, TDB s). */
  pos: Float64Array;
  t: Float64Array;
  /** Their positions after the scale mapping. */
  mapped: Float64Array;
  /** D-002: true positions of the bodies at each drawn sample (3 per body per sample) and which were evaluated. */
  bodyTruth: Float64Array;
  bodyOk: Uint8Array;
  /** bodyTruth holds every body the drawn samples need. */
  bodies: boolean;
  /** The scale amount the geometry was mapped at. */
  amount: number;
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
        complete: false,
        drawn: 0,
        waited: 0,
        split: 0,
        pos: new Float64Array(3 * samples.capacity),
        t: new Float64Array(samples.capacity),
        mapped: new Float64Array(3 * samples.capacity),
        bodyTruth: new Float64Array(3 * SCALE_TABLE.n * samples.capacity),
        bodyOk: new Uint8Array(SCALE_TABLE.n * samples.capacity),
        bodies: false,
        amount: -1,
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

  /**
   * D-002: true positions of the bodies at each drawn sample of a trail, only for bodies near enough (by distance
   * from the Sun, SCALE_TABLE.reachMin/Max) to push it; a moon brings its parent. False while a chunk is loading.
   */
  const fillBodies = useMemo(() => {
    const st6 = new Float64Array(6);
    const sc = new Float64Array(3);
    const n = SCALE_TABLE.n;
    const body = (tr: Trail, i: number, j: number): boolean => {
      if (tr.bodyOk[n * i + j]) return true;
      const id = DRAWN_BODIES[j]!.horizonsId;
      const status = gate.open ? eph!.state(id, tr.t[i]!, st6) : eph!.peek(id, tr.t[i]!, st6);
      if (status !== "ok") return status !== "loading";
      sceneFromEcliptic(st6, sc);
      const o = 3 * (n * i + j);
      tr.bodyTruth[o] = sc[0]!;
      tr.bodyTruth[o + 1] = sc[1]!;
      tr.bodyTruth[o + 2] = sc[2]!;
      tr.bodyOk[n * i + j] = 1;
      return true;
    };
    return (tr: Trail): boolean => {
      let done = true;
      tr.bodyOk.fill(0, 0, n * tr.drawn);
      for (let i = 0; i < tr.drawn; i++) {
        const r = Math.hypot(tr.pos[3 * i]!, tr.pos[3 * i + 1]!, tr.pos[3 * i + 2]!);
        for (let j = 0; j < n; j++) {
          if (!(r >= SCALE_TABLE.reachMin[j]! && r <= SCALE_TABLE.reachMax[j]!)) continue;
          const p = SCALE_TABLE.parent[j]!;
          if (p >= 0 && !body(tr, i, p)) done = false;
          if (!body(tr, i, j)) done = false;
          // A moon whose parent is missing would not be stretched: leave both out.
          if (p >= 0 && !tr.bodyOk[n * i + p]) tr.bodyOk[n * i + j] = 0;
        }
      }
      return done;
    };
  }, [eph, gate]);
  const off = useMemo(() => new Float64Array(3), []);

  useFrame(() => {
    const st = viewStore.getState();
    if (!gate.open) {
      let all = 1;
      for (let i = 0; i < frame.ok.length; i++) all &= frame.ok[i]! | frame.outside[i]!;
      gate.open = all === 1;
    }
    let shown = 0;
    let gap = 0;
    for (const tr of trails) {
      const cov = tr.coverage;
      if (!st.layers.trails || !cov || !trailRange(st.t, st.trailDays, st.trailDays, cov, tr.range)) {
        tr.line.visible = false;
        continue;
      }
      const s = tr.samples;
      // D-004: a resample with positions missing (chunks loading) would join its neighbours by chords across the
      // gap, so it replaces the drawn trail only when nothing complete is drawn yet; it is retried each frame.
      let upload = false;
      // While chunks are loading (positions missing) a trail is retried every RETRY_FRAMES frames, not every frame:
      // a full resample is thousands of evaluations and would hold up the downloads it waits for.
      if (trailStale(s, tr.range) && (s.missing === 0 || ++tr.waited >= RETRY_FRAMES)) {
        tr.waited = 0;
        sampleTrail(tr.evaluate, tr.range, s);
        upload = !(s.missing > 0 && tr.complete);
      }
      if (upload) {
        tr.complete = s.missing === 0;
        tr.drawn = s.count;
        tr.split = s.split;
        tr.pos.set(s.pos.subarray(0, 3 * s.count));
        tr.t.set(s.t.subarray(0, s.count));
        tr.bodies = false;
        const r = tr.range;
        const back = r.now - r.t0 || 1;
        const ahead = r.t1 - r.now || 1;
        for (let i = 0; i < s.count; i++) {
          const dt = s.t[i]! - r.now;
          tr.u[i] = dt < 0 ? dt / back : dt / ahead;
        }
        tr.line.geometry.setDrawRange(0, s.count);
        tr.line.geometry.getAttribute("u").needsUpdate = true;
      }
      // D-002: in exaggerated scale (or on the way there) each vertex is pushed out of enlarged bodies as the marker
      // is, against the bodies at the vertex's own time; their positions are kept per vertex, so a switch only remaps.
      const amount = frame.scale.amount;
      if (upload || amount !== tr.amount || (amount > 0 && !tr.bodies)) {
        if (amount > 0 && !tr.bodies) tr.bodies = fillBodies(tr);
        tr.amount = amount;
        mapTrail(SCALE_TABLE, amount, tr.bodyTruth, tr.bodyOk, tr.pos, tr.drawn, tr.mapped);
        // World positions as high and low float32 parts; the camera offset goes in the uniforms.
        for (let i = 0; i < 3 * tr.drawn; i++) {
          splitDouble(tr.mapped[i]!, split, 0);
          tr.high[i] = split[0]!;
          tr.low[i] = split[1]!;
        }
        const g = tr.line.geometry;
        g.getAttribute("position").needsUpdate = true;
        g.getAttribute("low").needsUpdate = true;
      }
      tr.line.visible = tr.drawn > 1;
      if (!tr.line.visible) continue;
      shown++;
      // For e2e specs (D-002): how far the trail's point at its sampling time lies from the marker drawn now.
      if (frame.ok[tr.index] && tr.t[tr.split] === st.t) {
        const m = 3 * tr.split;
        const w = 3 * tr.index;
        gap = Math.max(
          gap,
          Math.hypot(
            tr.mapped[m]! - frame.world[w]!,
            tr.mapped[m + 1]! - frame.world[w + 1]!,
            tr.mapped[m + 2]! - frame.world[w + 2]!,
          ),
        );
      }
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
    const g = gap.toExponential(0);
    if (canvas.dataset.trailGap !== g) canvas.dataset.trailGap = g;
  }, PRIORITY.objects);

  return (
    <>
      {trails.map((tr) => (
        <primitive key={tr.index} object={tr.line} />
      ))}
    </>
  );
}
