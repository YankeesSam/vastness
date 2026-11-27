import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { advanceTime, clampToRange, MAX_FRAME_DT_S, PLANET_COVERAGE, reverse, stepRate } from "../../core/time/clock";
import { tdbFromUtc } from "../../core/time/scales";
import type { FragmentCamera } from "../../core/share/fragment";
import { TRAIL_DEFAULT_DAYS } from "../../core/trails/sample";

// VN-TIM-004: the view store. Simulation time is one float64 TDB seconds value since J2000 (ADR-0003), advanced by
// the frame clock (rate x real seconds, with one frame clamped so a hidden tab never jumps; src/core/time/clock.ts)
// and held inside the planets' coverage (VN-TIM-001), pausing at an edge. Selection, the camera
// target and the layer switches live here too. Per-frame camera state does not: it is mutable scene state.

export { advanceTime, MAX_FRAME_DT_S };

export type Layer = "bodies" | "labels" | "markers" | "orbits" | "trails";

export interface ViewState {
  /** TDB seconds since J2000. */
  t: number;
  /** Simulation seconds per real second; negative runs backwards. */
  rate: number;
  paused: boolean;
  /** Horizons ID of the selected object, or null. */
  selection: number | null;
  /** Horizons ID the camera is aimed at (and follows). */
  target: number;
  /** Bumped by every setTarget, so choosing the current target again flies back to it. */
  targetSeq: number;
  layers: Record<Layer, boolean>;
  /** VN-UI-002: a camera to jump to (a shared link), applied by the scene when cameraSeq changes. */
  cameraRequest: FragmentCamera | null;
  cameraSeq: number;
  /** VN-CAT-004: spacecraft trail range, days back and ahead (Infinity: the whole coverage). */
  trailDays: number;
  tick(dtRealS: number): void;
  setTime(t: number): void;
  setRate(rate: number): void;
  setPaused(paused: boolean): void;
  /** VN-TIM-002 */
  togglePlay(): void;
  faster(): void;
  slower(): void;
  reverse(): void;
  /** VN-TIM-003: the current UTC instant (ms since the Unix epoch, default the wall clock), playing at real time. */
  now(ms?: number): void;
  select(id: number | null): void;
  setTarget(id: number): void;
  setLayer(layer: Layer, on: boolean): void;
  /** Places the camera at once (no fly-to) and makes its target the camera target. */
  setCamera(cam: FragmentCamera): void;
  setTrailDays(days: number): void;
}

/** TDB seconds for the current wall-clock instant (UTC to TDB at the edge, ADR-0003). */
export function tdbNow(ms = Date.now()): number {
  const d = new Date(ms);
  const seconds = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
  return tdbFromUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), seconds);
}

export interface ViewInit {
  t?: number;
  target?: number;
}

export function createViewStore(init: ViewInit = {}): StoreApi<ViewState> {
  return createStore<ViewState>()((set) => ({
    t: init.t ?? tdbNow(),
    rate: 1,
    paused: false,
    selection: null,
    target: init.target ?? 399,
    targetSeq: 0,
    layers: { bodies: true, labels: true, markers: true, orbits: true, trails: true },
    trailDays: TRAIL_DEFAULT_DAYS,
    tick: (dt) =>
      set((s) => {
        const c = clampToRange(advanceTime(s.t, s.rate, dt, s.paused), PLANET_COVERAGE.start, PLANET_COVERAGE.end);
        return c.atEdge ? { t: c.t, paused: true } : { t: c.t };
      }),
    setTime: (t) => set({ t: clampToRange(t, PLANET_COVERAGE.start, PLANET_COVERAGE.end).t }),
    setRate: (rate) => set({ rate }),
    setPaused: (paused) => set({ paused }),
    togglePlay: () => set((s) => ({ paused: !s.paused })),
    faster: () => set((s) => ({ rate: stepRate(s.rate, 1) })),
    slower: () => set((s) => ({ rate: stepRate(s.rate, -1) })),
    reverse: () => set((s) => ({ rate: reverse(s.rate) })),
    now: (ms) => set({ t: tdbNow(ms), rate: 1, paused: false }),
    select: (selection) => set({ selection }),
    setTarget: (target) => set((s) => ({ target, targetSeq: s.targetSeq + 1 })),
    cameraRequest: null,
    cameraSeq: 0,
    setCamera: (cam) => set((s) => ({ cameraRequest: cam, cameraSeq: s.cameraSeq + 1, target: cam.target })),
    setLayer: (layer, on) => set((s) => ({ layers: { ...s.layers, [layer]: on } })),
    setTrailDays: (trailDays) => set({ trailDays: trailDays > 0 ? trailDays : TRAIL_DEFAULT_DAYS }),
  }));
}

/** The app's one view store. */
export const viewStore = createViewStore();

export function useView<T>(selector: (s: ViewState) => T): T {
  return useStore(viewStore, selector);
}
