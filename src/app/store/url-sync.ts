import type { StoreApi } from "zustand/vanilla";
import { decodeFragment, encodeFragment, type FragmentCamera } from "../../core/share/fragment";
import { CATALOG_BY_ID } from "../catalog";
import type { ViewState } from "./view";

// VN-UI-002: the view store mirrored to the URL fragment. On start the fragment (a shared link, VN-WEB-002) sets the
// view; then the fragment follows the view, written with replaceState (no history entry per change) at most every
// `everyMs`. A fragment changed by hand or a link pasted into the same tab is applied as well. The camera lives in
// the scene's rig, so the scene registers a reader for it. The fragment never leaves the browser.

export type UrlWindow = {
  location: { hash: string };
  history: { replaceState(data: unknown, unused: string, url: string): void };
  addEventListener(name: "hashchange", f: () => void): void;
  removeEventListener(name: "hashchange", f: () => void): void;
};

let cameraSource: (() => FragmentCamera | null) | null = null;

/** The scene's camera, as target, distance and angles (null before the scene is up). */
export function setCameraSource(f: (() => FragmentCamera | null) | null): void {
  cameraSource = f;
}

const known = (id: number) => CATALOG_BY_ID.has(id);

export function currentFragment(store: StoreApi<ViewState>): string {
  const s = store.getState();
  return encodeFragment({
    t: s.t,
    rate: s.rate,
    paused: s.paused,
    selection: s.selection,
    cam: cameraSource?.() ?? null,
    layers: s.layers,
  });
}

/** Applies the fields of a fragment that pass its checks. */
export function applyFragment(hash: string, store: StoreApi<ViewState>): void {
  const f = decodeFragment(hash, known);
  const patch: Partial<ViewState> = {};
  if (f.t !== undefined) patch.t = f.t;
  if (f.rate !== undefined) patch.rate = f.rate;
  if (f.paused !== undefined) patch.paused = f.paused;
  if (f.selection !== undefined) patch.selection = f.selection;
  if (f.layers) patch.layers = f.layers;
  store.setState(patch);
  if (f.cam) store.getState().setCamera(f.cam);
}

/** Applies the page's fragment, then keeps it in step with the view. Returns a stop function. */
export function startUrlSync(store: StoreApi<ViewState>, win: UrlWindow, everyMs = 1000): () => void {
  let last = win.location.hash.replace(/^#/, "");
  if (last) applyFragment(last, store);
  const write = () => {
    const s = currentFragment(store);
    if (s === last) return;
    last = s;
    win.history.replaceState(null, "", `#${s}`);
  };
  const changed = () => {
    const h = win.location.hash.replace(/^#/, "");
    if (h === last) return;
    last = h;
    applyFragment(h, store);
  };
  const timer = setInterval(write, everyMs);
  win.addEventListener("hashchange", changed);
  return () => {
    clearInterval(timer);
    win.removeEventListener("hashchange", changed);
  };
}
