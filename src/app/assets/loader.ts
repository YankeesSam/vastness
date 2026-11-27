import { createEphemeris, type Ephemeris, type EphemerisManifest } from "../../core/ephem/ephemeris";

// VN-GEN-002, ADR-0005: the one place the app fetches, and only its own files (relative to the page's base).

export async function loadAsset(path: string): Promise<ArrayBuffer> {
  const res = await fetch(new URL(path, document.baseURI), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.arrayBuffer();
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
 * VN-PRF-004: the ephemeris with every body's chunk for time t in memory. Started from main.tsx before React
 * mounts, so the downloads overlap script start-up and WebGL set-up; later callers share the same promise.
 */
export function preloadEphemeris(t: number): Promise<Ephemeris> {
  ready ??= loadEphemeris().then(async (e) => {
    await e.load(t);
    return e;
  });
  return ready;
}
