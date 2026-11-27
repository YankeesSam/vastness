import { useEffect, useState } from "react";
import { BODIES } from "../../core/constants";
import type { Ephemeris } from "../../core/ephem/ephemeris";
import {
  createReadout,
  formatDistance,
  formatLightTime,
  formatSpeed,
  READOUT_INTERVAL_MS,
  readouts,
  type DistanceUnit,
  type Readout,
} from "../../core/readouts";
import { coverageState, reasonText } from "../../scene/spacecraft/coverage";
import { parseUtc } from "../../core/time/scales";
import { loadEphemeris } from "../assets/loader";
import { isSafeUrl, type CatalogObject } from "../../core/catalog/schema";
import { CATALOG_BY_ID, launchTdb } from "../catalog";
import { viewStore } from "../store/view";
import styles from "./InfoPanel.module.css";

// VN-INF-001, VN-INF-002, VN-INF-004: the info panel for the selected body: name and type, distances from the Sun
// and Earth with light-time, heliocentric speed and speed relative to Earth, at the current simulation time.
// Updated on a 250 ms timer (at most 4 times a second), in the user's distance unit.

const EARTH = 399;

export function bodyType(id: number): string {
  if (id < 0) return "Spacecraft";
  if (id === 10) return "Star";
  if (id > 100 && id % 100 === 99) return "Planet";
  return "Moon";
}

type Shown =
  { status: "ok"; r: Readout } | { status: "loading" } | { status: "none" } | { status: "outside"; reason: string };

function compute(eph: Ephemeris, id: number, t: number, body: Float64Array, earth: Float64Array): Shown {
  // VN-EPH-007: outside a spacecraft's coverage, say why instead of showing numbers.
  if (id < 0) {
    const entry = CATALOG_BY_ID.get(id);
    const cov = eph.has?.(id) ? eph.coverage(id) : null;
    const c = coverageState(t, cov, entry, launchTdb(entry, parseUtc));
    if (!c.drawn)
      return { status: "outside", reason: reasonText(c.reason!, entry?.name ?? `${id}`, cov, entry?.launch) };
  }
  const a = eph.state(id, t, body);
  const b = eph.state(EARTH, t, earth);
  if (a === "ok" && b === "ok") return { status: "ok", r: readouts(body, earth, createReadout()) };
  return a === "loading" || b === "loading" ? { status: "loading" } : { status: "none" };
}

const STATE_TEXT = { operating: "Operating", ended: "Ended", unclear: "Unclear" } as const;

// VN-INF-003: the mission facts from the catalog. Links open in a new tab with rel="noopener noreferrer"; only
// https URLs are rendered (the catalog checker already insists, this is the second guard).
function Mission({ o }: { o: CatalogObject }) {
  const links = o.sources.filter((s) => isSafeUrl(s.url));
  return (
    <section className={styles.mission} aria-labelledby="mission-heading">
      <h4 id="mission-heading" className={styles.section}>
        Mission
      </h4>
      <dl className={styles.readouts}>
        {o.launch && (
          <>
            <dt>Launch</dt>
            <dd>{o.launch}</dd>
          </>
        )}
        {o.status && (
          <>
            <dt>Status</dt>
            <dd>
              {STATE_TEXT[o.status.state]} (as of {o.status.as_of})
              {o.status.note && (
                <small className={styles.note} data-status-note>
                  {o.status.note}
                </small>
              )}
            </dd>
          </>
        )}
        {o.agency && (
          <>
            <dt>Agency</dt>
            <dd>{o.agency}</dd>
          </>
        )}
      </dl>
      <p className={styles.summary}>{o.summary}</p>
      {o.goals.length > 0 && (
        <>
          <h4 id="goals-heading" className={styles.section}>
            Science goals
          </h4>
          <ul className={styles.list} aria-labelledby="goals-heading">
            {o.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </>
      )}
      {links.length > 0 && (
        <>
          <h4 id="sources-heading" className={styles.section}>
            Sources
          </h4>
          <ul className={styles.list} aria-labelledby="sources-heading">
            {links.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export interface InfoPanelProps {
  selection: number | null;
  units: DistanceUnit;
  onUnits(units: DistanceUnit): void;
  /** The ephemeris; defaults to the app's (tests pass their own). */
  ephemeris?: Promise<Ephemeris>;
}

export function InfoPanel({ selection, units, onUnits, ephemeris }: InfoPanelProps) {
  const [eph, setEph] = useState<Ephemeris | null>(null);
  const [shown, setShown] = useState<Shown>({ status: "loading" });

  useEffect(() => {
    let live = true;
    (ephemeris ?? loadEphemeris())
      .then((e) => {
        if (live) setEph(e);
      })
      .catch(() => {
        if (live) setShown({ status: "none" });
      });
    return () => {
      live = false;
    };
  }, [ephemeris]);

  useEffect(() => {
    if (!eph || selection === null) return;
    const body = new Float64Array(6);
    const earth = new Float64Array(6);
    const update = () => setShown(compute(eph, selection, viewStore.getState().t, body, earth));
    update();
    const timer = setInterval(update, READOUT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [eph, selection]);

  const name = selection === null ? undefined : (CATALOG_BY_ID.get(selection)?.name ?? BODIES[selection as 10]?.name);
  if (selection === null || name === undefined) {
    return <p data-muted>Select an object to see its details.</p>;
  }
  const isEarth = selection === EARTH;
  const entry = CATALOG_BY_ID.get(selection);
  return (
    <div>
      <h3 className={styles.name}>{name}</h3>
      <p className={styles.type}>{bodyType(selection)}</p>
      {shown.status === "ok" ? (
        <dl className={styles.readouts} aria-label="Read-outs">
          <dt>Distance from the Sun</dt>
          <dd>{selection === 10 ? "—" : formatDistance(shown.r.sunKm, units)}</dd>
          <dt>Distance from Earth</dt>
          <dd>{isEarth ? "—" : formatDistance(shown.r.earthKm, units)}</dd>
          <dt>Light-time from Earth</dt>
          <dd>
            {isEarth ? "—" : formatLightTime(shown.r.lightTimeS)}
            {!isEarth && (
              <small className={styles.note}>
                A signal sent from Earth now reaches {name} after this long, and what we see of {name} left it this long
                ago; a command needs that long to arrive.
              </small>
            )}
          </dd>
          <dt>Speed around the Sun</dt>
          <dd>{selection === 10 ? "—" : formatSpeed(shown.r.helioSpeedKmS, units)}</dd>
          <dt>Speed relative to Earth</dt>
          <dd>{isEarth ? "—" : formatSpeed(shown.r.earthSpeedKmS, units)}</dd>
        </dl>
      ) : (
        <p data-testid="no-position">
          {shown.status === "loading"
            ? "Loading positions…"
            : shown.status === "outside"
              ? shown.reason
              : "No position at this time."}
        </p>
      )}
      {entry?.type === "spacecraft" && <Mission o={entry} />}
      <label className={styles.units}>
        Units{" "}
        <select aria-label="Distance units" value={units} onChange={(e) => onUnits(e.target.value as DistanceUnit)}>
          <option value="km">km</option>
          <option value="au">AU</option>
          <option value="mi">miles</option>
        </select>
      </label>
    </div>
  );
}
