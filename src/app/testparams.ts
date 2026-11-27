import type { StoreApi } from "zustand/vanilla";
import { BODIES } from "../core/constants";
import { parseUtc } from "../core/time/scales";
import type { Layer, ViewState } from "./store/view";

// F5 (docs/TESTBED.md), VN-SCN-004, VN-CAM-004: URL parameters that fix a reference view for screenshots:
//   t=2026-01-01T00:00:00Z     simulation time (UTC)
//   cam=399,1.2e6,30,25        camera target (Horizons ID), distance km, azimuth and elevation in degrees
//   still=1                    time paused, so two frames are the same
//   layers=bodies,orbits       only these layers on
// Anything that does not parse is ignored; with no parameters the app starts as usual.

export interface TestCamera {
  target: number;
  distanceKm: number;
  /** rad */
  azimuth: number;
  /** rad */
  elevation: number;
}

export interface TestParams {
  t?: number;
  cam?: TestCamera;
  still?: boolean;
  layers?: Record<Layer, boolean>;
}

const LAYERS: readonly Layer[] = ["bodies", "labels", "markers", "orbits", "trails"];
const DEG = Math.PI / 180;

export function parseTestParams(search: string): TestParams {
  const q = new URLSearchParams(search);
  const out: TestParams = {};
  const t = q.get("t");
  if (t) {
    try {
      const v = parseUtc(t);
      if (Number.isFinite(v)) out.t = v;
    } catch {
      // ignored
    }
  }
  const cam = q.get("cam")?.split(",").map(Number);
  if (cam && cam.length === 4 && cam.every(Number.isFinite) && cam[0]! in BODIES && cam[1]! > 0) {
    out.cam = { target: cam[0]!, distanceKm: cam[1]!, azimuth: cam[2]! * DEG, elevation: cam[3]! * DEG };
  }
  if (q.get("still") === "1") out.still = true;
  const layers = q.get("layers")?.split(",");
  if (layers && layers.some((l) => (LAYERS as readonly string[]).includes(l))) {
    out.layers = { bodies: false, labels: false, markers: false, orbits: false, trails: false };
    for (const l of layers) if ((LAYERS as readonly string[]).includes(l)) out.layers[l as Layer] = true;
  }
  return out;
}

/** Sets the store's time, pause, target (without a fly-to) and layers from the parameters. */
export function applyTestParams(p: TestParams, store: StoreApi<ViewState>): void {
  const patch: Partial<ViewState> = {};
  if (p.t !== undefined) patch.t = p.t;
  if (p.still) patch.paused = true;
  if (p.cam) {
    patch.target = p.cam.target;
    patch.cameraRequest = null; // the scene starts at this camera (SceneView), not a fragment's
  }
  if (p.layers) patch.layers = p.layers;
  store.setState(patch);
}

/** The parameters of this page load. */
export const testParams: TestParams = typeof location === "undefined" ? {} : parseTestParams(location.search);
