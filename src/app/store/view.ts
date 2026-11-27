import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { tdbFromUtc } from "../../core/time/scales";

// VN-TIM-004: the view store. Simulation time is one float64 TDB seconds value since J2000 (ADR-0003), advanced by
// the frame clock (rate x real seconds, with one frame clamped so a hidden tab never jumps). Selection, the camera
// target and the layer switches live here too. Per-frame camera state does not: it is mutable scene state.

/** Longest real time one frame may advance the clock, seconds. */
export const MAX_FRAME_DT_S = 0.25;

export type Layer = "bodies" | "labels" | "markers" | "orbits";

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
  layers: Record<Layer, boolean>;
  tick(dtRealS: number): void;
  setTime(t: number): void;
  setRate(rate: number): void;
  setPaused(paused: boolean): void;
  select(id: number | null): void;
  setTarget(id: number): void;
  setLayer(layer: Layer, on: boolean): void;
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
    layers: { bodies: true, labels: true, markers: true, orbits: true },
    tick: (dt) => set((s) => ({ t: advanceTime(s.t, s.rate, dt, s.paused) })),
    setTime: (t) => set({ t }),
    setRate: (rate) => set({ rate }),
    setPaused: (paused) => set({ paused }),
    select: (selection) => set({ selection }),
    setTarget: (target) => set({ target }),
    setLayer: (layer, on) => set((s) => ({ layers: { ...s.layers, [layer]: on } })),
  }));
}

/** The app's one view store. */
export const viewStore = createViewStore();

export function useView<T>(selector: (s: ViewState) => T): T {
  return useStore(viewStore, selector);
}
