import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { CatalogObject } from "../../core/catalog/schema";
import type { Ephemeris } from "../../core/ephem/ephemeris";
import { PLANET_COVERAGE } from "../../core/time/clock";
import { parseUtc } from "../../core/time/scales";
import { loadEphemeris } from "../assets/loader";
import { CATALOG_BY_ID } from "../catalog";
import { viewStore, type ViewState } from "../store/view";
import styles from "./Timeline.module.css";

// VN-TIM-005: a scrubber over the selected object's coverage, with its launch and catalog events (flybys, arrivals,
// milestones) marked; choosing a mark jumps there. With nothing selected it spans the planets' coverage.

export interface Mark {
  t: number;
  /** 0..1 along the track. */
  x: number;
  kind: "launch" | "flyby" | "arrival" | "milestone";
  label: string;
  date: string;
}

export interface TimelineModel {
  lo: number;
  hi: number;
  /** The coverage as fractions of the track, or null when there is none to show. */
  band: { from: number; to: number } | null;
  marks: Mark[];
  thumb: number;
}

/** Room either side of the coverage, as a fraction of its length. */
const PAD = 0.05;

export function timelineModel(
  object: CatalogObject | undefined,
  coverage: { start: number; end: number } | null,
  t: number,
): TimelineModel {
  const craft = object?.type === "spacecraft" || object?.type === "satellite";
  const shown = craft && coverage ? coverage : null;
  let lo: number = PLANET_COVERAGE.start;
  let hi: number = PLANET_COVERAGE.end;
  if (shown) {
    const pad = (shown.end - shown.start) * PAD;
    lo = Math.max(PLANET_COVERAGE.start, shown.start - pad);
    hi = Math.min(PLANET_COVERAGE.end, shown.end + pad);
  }
  const at = (v: number) => (v - lo) / (hi - lo);
  const marks: Mark[] = [];
  if (craft && object.launch) {
    marks.push({ t: parseUtc(object.launch), x: 0, kind: "launch", label: "Launch", date: object.launch });
  }
  for (const e of object?.events ?? [])
    marks.push({ t: parseUtc(e.date), x: 0, kind: e.kind, label: e.label, date: e.date });
  const inside = marks.filter((k) => k.t >= lo && k.t <= hi).map((k) => ({ ...k, x: at(k.t) }));
  return {
    lo,
    hi,
    band: shown ? { from: at(shown.start), to: at(shown.end) } : null,
    marks: inside,
    thumb: Math.min(1, Math.max(0, at(t))),
  };
}

export interface TimelineProps {
  object: CatalogObject | undefined;
  coverage: { start: number; end: number } | null;
  store?: StoreApi<ViewState>;
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`;

export function Timeline({ object, coverage, store = viewStore }: TimelineProps) {
  // The thumb moves in steps of 1/1000 of the track, so the bar does not re-render every frame.
  const step = useStore(store, (s) => {
    const m = timelineModel(object, coverage, s.t);
    return Math.round(m.thumb * 1000);
  });
  const t = store.getState().t;
  const m = timelineModel(object, coverage, t);
  return (
    <div className={styles.timeline}>
      <span className={styles.name}>{object && m.band ? object.name : "1900–2100"}</span>
      <div className={styles.track}>
        {m.band && (
          <div
            className={styles.band}
            style={{ left: pct(m.band.from), width: pct(m.band.to - m.band.from) }}
            title="Trajectory coverage"
          />
        )}
        <input
          type="range"
          aria-label="Timeline"
          className={styles.slider}
          min={m.lo}
          max={m.hi}
          step="any"
          value={m.lo + (step / 1000) * (m.hi - m.lo)}
          onChange={(e) => store.getState().setTime(Number(e.target.value))}
        />
        {m.marks.map((k) => (
          <button
            key={`${k.kind}-${k.date}-${k.label}`}
            type="button"
            className={`${styles.mark} ${styles[k.kind] ?? ""}`}
            style={{ left: pct(k.x) }}
            aria-label={`${k.label}, ${k.date}`}
            title={`${k.label}, ${k.date}`}
            onClick={() => store.getState().setTime(k.t)}
          />
        ))}
      </div>
    </div>
  );
}

/** The timeline for the store's selection, with its coverage from the app's ephemeris. */
export function SelectionTimeline({ ephemeris }: { ephemeris?: Promise<Ephemeris> }) {
  const selection = useStore(viewStore, (s) => s.selection);
  const [eph, setEph] = useState<Ephemeris | null>(null);
  useEffect(() => {
    let live = true;
    (ephemeris ?? loadEphemeris())
      .then((e) => {
        if (live) setEph(e);
      })
      .catch(() => {
        // no coverage band; the scrubber still spans the planets' coverage
      });
    return () => {
      live = false;
    };
  }, [ephemeris]);
  const object = selection === null ? undefined : CATALOG_BY_ID.get(selection);
  const coverage = eph && selection !== null && eph.has?.(selection) ? eph.coverage(selection) : null;
  return <Timeline object={object} coverage={coverage} />;
}
