import { useEffect, useRef } from "react";
import { LEAP_SECONDS_SOURCE, LEAP_SECONDS_VALID_UNTIL } from "../../core/time/leap-seconds";
import { buildInfo } from "../build-info";
import styles from "./About.module.css";

// VN-UI-004: version, commit, data dates, licences, attributions. The Horizons date fills in once the ephemeris
// manifest (T-018) exists.
export function About({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="about-title">About Vastness</h2>
        <p>The solar system and its spacecraft, positioned from NASA/JPL Horizons data.</p>
        <dl className={styles.facts}>
          <dt>Version</dt>
          <dd>{buildInfo.version}</dd>
          <dt>Commit</dt>
          <dd>
            <code>{buildInfo.commit}</code>
          </dd>
          <dt>Built from</dt>
          <dd>{buildInfo.commit_time}</dd>
          <dt>Horizons retrieval</dt>
          <dd>no ephemerides generated yet</dd>
          <dt>Leap-second table</dt>
          <dd>
            {LEAP_SECONDS_SOURCE}, known until {LEAP_SECONDS_VALID_UNTIL}
          </dd>
        </dl>
        <h3>Licences</h3>
        <p>
          Vastness is licensed under the Apache-2.0 licence: <a href="LICENSE">LICENSE</a>, <a href="NOTICE">NOTICE</a>.
          Bundled packages: <a href="THIRD_PARTY_NOTICES.txt">third-party notices</a>.
        </p>
        <h3>Attributions</h3>
        <p>
          Positions come from the JPL Horizons System (NASA/JPL Horizons, Jet Propulsion Laboratory, California
          Institute of Technology). Vastness is not affiliated with or endorsed by NASA or JPL.
        </p>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
