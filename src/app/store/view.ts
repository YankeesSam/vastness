import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { tdbFromUtc } from "../../core/time/scales";
import { TRAIL_DEFAULT_DAYS } from "../../core/trails/sample";

// VN-TIM-004: the view store. Simulation time is one float64 TDB seconds value since J2000 (ADR-0003), advanced by
// the frame clock (rate x real seconds, with one frame clamped so a hidden tab never jumps). Selection, the camera
// target and the layer switches live here too. Per-frame camera state does not: it is mutable scene state.

/** Longest real time one frame may advance the clock, seconds. */
export const MAX_FRAME_DT_S = 0.25;

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
  /** VN-CAT-004: spacecraft trail range, days back and ahead (Infinity: the whole coverage). */
  trailDays: number;
  tick(dtRealS: number): void;
  setTime(t: number): void;
  setRate(rate: number): void;
  setPaused(paused: boolean): void;
  select(id: number | null): void;
  setTarget(id: number): void;
  setLayer(layer: Layer, on: boolean): void;
  setTrailDays(days: number): void;
}

/** The frame clock step: rate x dt, dt clamped to [0, MAX_FRAME_DT_S]; nothing while paused. */
export function advanceTime(t: number, rate: number, dtRealS: number, paused: boolean): number {
  if (paused || !(dtRealS > 0)) return t;
  return t + rate * Math.min(dtRealS, MAX_FRAME_DT_S);
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
    tick: (dt) => set((s) => ({ t: advanceTime(s.t, s.rate, dt, s.paused) })),
    setTime: (t) => set({ t }),
    setRate: (rate) => set({ rate }),
    setPaused: (paused) => set({ paused }),
    select: (selection) => set({ selection }),
    setTarget: (target) => set((s) => ({ target, targetSeq: s.targetSeq + 1 })),
    setLayer: (layer, on) => set((s) => ({ layers: { ...s.layers, [layer]: on } })),
    setTrailDays: (trailDays) => set({ trailDays: trailDays > 0 ? trailDays : TRAIL_DEFAULT_DAYS }),
  }));
}

/** The app's one view store. */
export const viewStore = createViewStore();

export function useView<T>(selector: (s: ViewState) => T): T {
  return useStore(viewStore, selector);
}
