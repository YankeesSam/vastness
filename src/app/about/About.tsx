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
      if (e.key !== "Escape") return;
      e.preventDefault(); // handled: the camera keeps following
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
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
        <p>
          Stars from the Yale Bright Star Catalogue, 5th revised edition (Hoffleit and Warren), via NASA HEASARC.
          Saturn&apos;s rings from the NASA NSSDCA Saturnian Rings Fact Sheet.
        </p>
        <p>
          Planet textures by <a href="https://www.solarsystemscope.com/textures/">Solar System Scope</a>{" "}
          (solarsystemscope.com), <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, based on NASA
          data. Body orientation from the IAU WGCCRE 2015 rotation models (Archinal et al. 2018).
        </p>
        <p>
          Space weather: CMEs, storms and shocks from NASA DONKI (Community Coordinated Modeling Center, NASA GSFC); CME
          mass and energy from the SOHO/LASCO CME catalog (CDAW Data Center, NASA and The Catholic University of
          America, with the Naval Research Laboratory; SOHO is an ESA and NASA project); solar wind and Kp from NOAA
          SWPC. Sun images courtesy of NASA/SDO and the AIA, EVE, and HMI science teams, rendered by Helioviewer.org.
        </p>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
