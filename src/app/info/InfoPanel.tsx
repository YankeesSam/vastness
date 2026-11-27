import { useEffect, useState } from "react";
import { BODIES, type BodyId } from "../../core/constants";
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
import { loadEphemeris } from "../assets/loader";
import { viewStore } from "../store/view";
import styles from "./InfoPanel.module.css";

// VN-INF-001, VN-INF-002, VN-INF-004: the info panel for the selected body: name and type, distances from the Sun
// and Earth with light-time, heliocentric speed and speed relative to Earth, at the current simulation time.
// Updated on a 250 ms timer (at most 4 times a second), in the user's distance unit.

const EARTH = 399;

export function bodyType(id: number): string {
  if (id === 10) return "Star";
  if (id > 100 && id % 100 === 99) return "Planet";
  return "Moon";
}

type Shown = { status: "ok"; r: Readout } | { status: "loading" } | { status: "none" };

function compute(eph: Ephemeris, id: number, t: number, body: Float64Array, earth: Float64Array): Shown {
  const a = eph.state(id, t, body);
  const b = eph.state(EARTH, t, earth);
  if (a === "ok" && b === "ok") return { status: "ok", r: readouts(body, earth, createReadout()) };
  return a === "loading" || b === "loading" ? { status: "loading" } : { status: "none" };
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

  if (selection === null || !(selection in BODIES)) {
    return <p data-muted>Select an object to see its details.</p>;
  }
  const name = BODIES[selection as BodyId].name;
  const isEarth = selection === EARTH;
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
        <p>{shown.status === "loading" ? "Loading positions…" : "No position at this time."}</p>
      )}
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
