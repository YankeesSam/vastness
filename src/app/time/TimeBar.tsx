import { formatUtc } from "../../core/time/scales";
import { useView } from "../store/view";

/** "YYYY-MM-DD hh:mm:ss UTC" from TDB seconds (UTC only at the UI edge, ADR-0003). */
export function formatUtcLabel(tdb: number): string {
  return formatUtc(tdb, 0).replace("T", " ").replace("Z", " UTC");
}

// VN-UI-001, VN-TIM-004: the bottom time bar shows the view store's simulation time in UTC. It re-renders once per
// shown second, not per frame.
export function TimeBar({ className }: { className?: string | undefined }) {
  const second = useView((s) => Math.floor(s.t));
  const rate = useView((s) => (s.paused ? 0 : s.rate));
  const label = formatUtcLabel(second);
  return (
    <footer className={className} aria-label="Time">
      <time dateTime={label.replace(" ", "T").replace(" UTC", "Z")}>{label}</time>
      <span>{rate === 0 ? "Paused" : `Rate ${rate}×`}</span>
    </footer>
  );
}
