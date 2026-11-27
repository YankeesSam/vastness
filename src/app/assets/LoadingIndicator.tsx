import { useSyncExternalStore } from "react";
import { chunkActivity } from "./loader";
import styles from "./LoadingIndicator.module.css";

// VN-UI-005: a quiet note in the top bar while ephemeris chunks download (spacecraft streaming in after the first
// frame, or a time jump to a period not yet loaded). Never blocks or covers the view.
export function LoadingIndicator() {
  const pending = useSyncExternalStore(chunkActivity.subscribe, chunkActivity.pending);
  return (
    <span role="status" aria-live="polite" className={styles.indicator}>
      {pending > 0 ? "Loading trajectories…" : ""}
    </span>
  );
}
