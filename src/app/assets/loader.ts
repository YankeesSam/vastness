import { createEphemeris, type Ephemeris, type EphemerisManifest } from "../../core/ephem/ephemeris";

// VN-GEN-002, ADR-0005: the one place the app fetches, and only its own files (relative to the page's base).

type Listener = (pending: number) => void;

/** VN-UI-005: how many asset downloads are in flight, for the quiet loading indicator. */
export const chunkActivity = (() => {
  let pending = 0;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l(pending));
  return {
    pending: () => pending,
    subscribe(l: Listener): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    begin() {
      pending++;
      emit();
    },
    end() {
      pending--;
      emit();
    },
  };
})();

export async function loadAsset(path: string): Promise<ArrayBuffer> {
  chunkActivity.begin();
  try {
    const res = await fetch(new URL(path, document.baseURI), { credentials: "same-origin" });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return await res.arrayBuffer();
  } finally {
    chunkActivity.end();
  }
}

let ephemeris: Promise<Ephemeris> | null = null;

/** The app's ephemeris over public/ephem (manifest once, chunks lazily). */
export function loadEphemeris(): Promise<Ephemeris> {
  ephemeris ??= loadAsset("ephem/manifest.json").then((buf) => {
    const manifest = JSON.parse(new TextDecoder().decode(buf)) as EphemerisManifest;
    return createEphemeris(manifest, (file) => loadAsset(`ephem/${file}`));
  });
  return ephemeris;
}

let ready: Promise<Ephemeris> | null = null;

/**
 * VN-PRF-004, VN-UI-005: the ephemeris with the natural bodies' chunks for time t in memory (spacecraft stream in
 * after the first frame, see streamSpacecraft). Started from main.tsx before React mounts, so the downloads overlap
 * script start-up and WebGL set-up; later callers share the same promise.
 */
export function preloadEphemeris(t: number): Promise<Ephemeris> {
  ready ??= loadEphemeris().then(async (e) => {
    await e.load(
      t,
      e.ids.filter((id) => id > 0),
    );
    return e;
  });
  return ready;
}

/** VN-UI-005: loads the spacecraft chunks for time t; the scene calls it once the first frame is up. */
export function streamSpacecraft(e: Ephemeris, t: number): Promise<void> {
  return e.load(
    t,
    e.ids.filter((id) => id < 0),
  );
}
