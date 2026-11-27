import { useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { PLANET_COVERAGE, rateIndex, rateLabel, RATE_LADDER } from "../../core/time/clock";
import { viewStore, type ViewState } from "../store/view";
import styles from "./TimeBar.module.css";
import { browserOffset, formatTimeLabel, inputValue, tdbFromInput, type OffsetFn, type Zone } from "./zone";

// VN-TIM-001..004: the bottom time bar. The simulation time in UTC (or local time), a picker that moves to any
// instant in the planets' coverage, play/pause, reverse, slower/faster along the named rates, and Now. It re-renders
// once per shown second. Times outside a spacecraft's coverage are allowed; the info panel says why
// it is not drawn (VN-EPH-007).

export interface TimeBarProps {
  className?: string | undefined;
  /** The view store (tests pass their own). */
  store?: StoreApi<ViewState>;
  /** The local zone's offset (tests pass a fixed one). */
  offsetMinutes?: OffsetFn;
}

export function TimeBar({ className, store = viewStore, offsetMinutes = browserOffset }: TimeBarProps) {
  const [zone, setZone] = useState<Zone>("utc");
  // Strings, so the bar re-renders once per shown second and not per frame.
  const shown = useStore(store, (s) => inputValue(s.t, zone, offsetMinutes));
  const label = useStore(store, (s) => formatTimeLabel(s.t, zone, offsetMinutes));
  const utc = useStore(store, (s) => inputValue(s.t, "utc"));
  const rate = useStore(store, (s) => s.rate);
  const paused = useStore(store, (s) => s.paused);
  const [draft, setDraft] = useState<string | null>(null);
  const actions = store.getState();

  const commit = () => {
    if (draft === null) return;
    const t = tdbFromInput(draft, zone, offsetMinutes);
    if (t !== null) actions.setTime(t);
    setDraft(null);
  };

  const index = rateIndex(rate);
  return (
    <footer className={`${className ?? ""} ${styles.bar}`} aria-label="Time">
      <time dateTime={utc + "Z"} className={styles.label}>
        {label}
      </time>
      <input
        type="datetime-local"
        step="1"
        aria-label="Date and time"
        min={inputValue(PLANET_COVERAGE.start, zone, offsetMinutes)}
        max={inputValue(PLANET_COVERAGE.end, zone, offsetMinutes)}
        value={draft ?? shown}
        onFocus={() => setDraft(inputValue(store.getState().t, zone, offsetMinutes))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setDraft(null);
        }}
      />
      <select aria-label="Time zone" value={zone} onChange={(e) => setZone(e.target.value as Zone)}>
        <option value="utc">UTC</option>
        <option value="local">Local</option>
      </select>
      <div className={styles.controls} role="group" aria-label="Playback">
        <button type="button" aria-label="Reverse" aria-pressed={rate < 0} onClick={actions.reverse}>
          ⇄
        </button>
        <button type="button" aria-label="Slower" onClick={actions.slower}>
          «
        </button>
        <button type="button" aria-label={paused ? "Play" : "Pause"} onClick={actions.togglePlay}>
          {paused ? "▶" : "❚❚"}
        </button>
        <button type="button" aria-label="Faster" onClick={actions.faster}>
          »
        </button>
        <select
          aria-label="Rate"
          value={String(index)}
          onChange={(e) => {
            const rung = RATE_LADDER[Number(e.target.value)];
            if (rung) actions.setRate(rate < 0 ? -rung.rate : rung.rate);
          }}
        >
          {index < 0 && <option value="-1">{rateLabel(rate)}</option>}
          {RATE_LADDER.map((r, i) => (
            <option key={r.name} value={String(i)}>
              {rate < 0 ? `−${r.name}` : r.name}
            </option>
          ))}
        </select>
        <span className={styles.state}>{paused ? "Paused" : rateLabel(rate)}</span>
        <button type="button" onClick={() => actions.now()}>
          Now
        </button>
      </div>
    </footer>
  );
}
