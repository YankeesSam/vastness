import { useEffect, useMemo, useState } from "react";
import type { CatalogObject } from "../../core/catalog/schema";
import type { Ephemeris } from "../../core/ephem/ephemeris";
import { formatDistance, READOUT_INTERVAL_MS, type DistanceUnit } from "../../core/readouts";
import { preloadEphemeris, streamSpacecraft } from "../assets/loader";
import { useView, viewStore } from "../store/view";
import styles from "./Fallback.module.css";

// VN-ACC-004, VN-GEN-011: without WebGL 2 the 3D view is replaced by a plain message and the object list with each
// object's distance from the Sun and from Earth at the simulation time. The side panel (object list, info panel)
// and the time bar stay as they are; this view runs the frame clock the scene would otherwise run (VN-TIM-004).

const SUN = 10;
const EARTH = 399;

export interface Distances {
  sun: number | null;
  earth: number | null;
}

/** Distances (km) of each object from the Sun and Earth at t; null where the ephemeris has no position (yet). */
export function distancesAt(eph: Ephemeris, ids: readonly number[], t: number): Map<number, Distances> {
  const sun = new Float64Array(6);
  const earth = new Float64Array(6);
  const s = new Float64Array(6);
  const sunOk = eph.state(SUN, t, sun) === "ok";
  const earthOk = eph.state(EARTH, t, earth) === "ok";
  const out = new Map<number, Distances>();
  for (const id of ids) {
    // D-007: an object without an ephemeris in this build (Cassini, held out) has no distances
    const ok = eph.has(id) && eph.state(id, t, s) === "ok";
    const d = (o: Float64Array) => Math.hypot(s[0]! - o[0]!, s[1]! - o[1]!, s[2]! - o[2]!);
    out.set(id, {
      sun: ok && sunOk && id !== SUN ? d(sun) : null,
      earth: ok && earthOk && id !== EARTH ? d(earth) : null,
    });
  }
  return out;
}

/** VN-TIM-004: advances simulation time by each animation frame's real seconds. */
function useFrameClock(): void {
  useEffect(() => {
    let id = 0;
    let last = performance.now();
    const step = (now: number) => {
      viewStore.getState().tick((now - last) / 1000);
      last = now;
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, []);
}

export function Fallback({
  objects,
  units,
  onChoose,
}: {
  /** In list order. */
  objects: readonly CatalogObject[];
  units: DistanceUnit;
  onChoose(id: number): void;
}) {
  useFrameClock();
  const [eph, setEph] = useState<Ephemeris | null>(null);
  const [failed, setFailed] = useState(false);
  // refreshed on a timer, also while paused: chunks that arrive later fill in their rows
  const [refresh, setRefresh] = useState(0);
  const selection = useView((s) => s.selection);
  const ids = useMemo(() => objects.map((o) => o.id), [objects]);

  useEffect(() => {
    let live = true;
    preloadEphemeris(viewStore.getState().t)
      .then((e) => {
        if (!live) return;
        setEph(e);
        streamSpacecraft(e, viewStore.getState().t).catch(() => {
          // a chunk that fails shows as no distance
        });
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    const timer = setInterval(() => setRefresh((n) => n + 1), READOUT_INTERVAL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const dist = useMemo(() => (eph ? distancesAt(eph, ids, viewStore.getState().t) : null), [eph, ids, refresh]);
  const show = (km: number | null | undefined) => (km == null ? "—" : formatDistance(km, units));

  return (
    <div className={styles.fallback} data-fallback="no-webgl2">
      <section className={styles.card} aria-labelledby="fallback-title">
        <h1 id="fallback-title">The 3D view needs WebGL 2</h1>
        <p>
          This browser or device does not offer WebGL 2, so the solar system cannot be drawn. The objects, their details
          and the time controls still work: choose an object for its read-outs.
        </p>
        {failed && <p role="alert">The ephemeris could not be loaded, so no distances can be shown.</p>}
        <table className={styles.table}>
          <caption>Distances at the time shown</caption>
          <thead>
            <tr>
              <th scope="col">Object</th>
              <th scope="col">From the Sun</th>
              <th scope="col">From Earth</th>
            </tr>
          </thead>
          <tbody>
            {objects.map((o) => {
              const d = dist?.get(o.id);
              return (
                <tr key={o.id}>
                  <th scope="row">
                    <button
                      type="button"
                      aria-current={selection === o.id ? "true" : undefined}
                      onClick={() => onChoose(o.id)}
                    >
                      {o.name}
                    </button>
                  </th>
                  <td>{show(d?.sun)}</td>
                  <td>{show(d?.earth)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
