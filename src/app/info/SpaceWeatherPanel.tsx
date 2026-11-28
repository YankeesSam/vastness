import { useEffect, useState } from "react";
import { AU_KM } from "../../core/constants";
import { isSafeUrl } from "../../core/catalog/schema";
import { READOUT_INTERVAL_MS } from "../../core/readouts";
import { speedClass } from "../../core/spaceweather/cme";
import {
  arrivalsNear,
  cmesInFlight,
  flaresLit,
  kpAt,
  stormAt,
  windAt,
  type Arrival,
  type SpaceWeather,
  type StormCme,
} from "../../core/spaceweather/model";
import type { Flare, SolarWindHour } from "../../core/spaceweather/types";
import { formatUtc } from "../../core/time/scales";
import { ensureSpaceWeather, spaceWeatherCache } from "../assets/spaceweather";
import { viewStore } from "../store/view";
import { MIN_PX, SUN_IMAGES, sunImageAt } from "../../scene/sun/SunImage";

const SUN_IMAGE_COUNT = SUN_IMAGES.length;
import styles from "./InfoPanel.module.css";

// T-101, T-102 (VN-EXT-005..007): the space weather panel, shown while the layer is on: the CMEs in flight with
// every value and its source (DONKI direction, half-angle, speed; CDAW mass and energy, or that they are unknown or
// poor), flares lit, predicted and measured arrivals with Kp, the storm under way, and the L1 solar wind where SWPC's
// measurements cover the time. Updated at most 4 times a second like the info panel.

interface Now {
  t: number;
  cmes: Array<{ c: StormCme; rAu: number }>;
  flares: Flare[];
  arrivals: Arrival[];
  storm: { id: string; kp: number } | null;
  kp: { iso: string; kp: number } | null;
  wind: SolarWindHour | null;
}

function snapshot(sw: SpaceWeather, t: number): Now {
  const storm = stormAt(sw, t);
  return {
    t,
    cmes: cmesInFlight(sw, t).map((f) => ({ c: sw.cmes[f.index]!, rAu: f.rKm / AU_KM })),
    flares: flaresLit(sw, t),
    arrivals: arrivalsNear(sw, t),
    storm: storm && { id: storm.storm.id, kp: storm.kp },
    kp: kpAt(sw, t),
    wind: windAt(sw, t),
  };
}

const sci = (v: number, unit: string) => {
  const [m, e] = v.toExponential(1).split("e");
  return `${m} × 10^${Number(e)} ${unit}`;
};
const minute = (iso: string) => iso.replace("T", " ").replace("Z", " UTC");
const link = (href: string, text: string) =>
  isSafeUrl(href) ? (
    <a href={href} target="_blank" rel="noreferrer">
      {text}
    </a>
  ) : null;

function CmeItem({ c, rAu }: { c: StormCme; rAu: number }) {
  const cls = speedClass(c.speed, c.type);
  const m = c.cdaw;
  return (
    <li data-testid="cme">
      <strong>CME {minute(c.start)}</strong> {link(c.link, "DONKI")}
      <br />
      {c.speed} km/s (class {cls.name}), half-angle {c.halfAngle}°, toward latitude {c.lat}°, longitude {c.lon}°
      {c.source ? ` from ${c.source}` : ""}; front at {rAu.toFixed(2)} AU
      <br />
      {m && m.mass !== null ? (
        <>
          Mass {sci(m.mass, "g")}
          {m.energy !== null ? `, kinetic energy ${sci(m.energy, "erg")}` : ""} (CDAW, LASCO CME at{" "}
          {m.cdaw.slice(11, 19)}){m.poor ? "; the catalog marks this measurement uncertain or the event poor" : ""}
        </>
      ) : (
        <span data-testid="mass-unknown">
          Mass unknown ({m ? "the CDAW catalog has no mass for it" : "no CDAW catalog match"}); drawn at a default
          density
        </span>
      )}
      {c.enlil?.earthArrival && (
        <>
          <br />
          WSA-Enlil: arrival at Earth {minute(c.enlil.earthArrival)}
          {c.enlil.earthGlancing ? " (glancing blow)" : ""}
          {c.enlil.kp90 !== null ? `, Kp ${c.enlil.kp90} to ${c.enlil.kp180 ?? "?"}` : ""}
        </>
      )}
    </li>
  );
}

function Wind({ w }: { w: SolarWindHour }) {
  const v = (x: number | null, unit: string, digits = 1) => (x === null ? "—" : `${x.toFixed(digits)} ${unit}`);
  return (
    <dl className={styles.readouts} aria-label="Solar wind at L1">
      <dt>Speed</dt>
      <dd>{v(w.speed, "km/s", 0)}</dd>
      <dt>Proton density</dt>
      <dd>{v(w.density, "/cm³")}</dd>
      <dt>IMF Bz (GSM)</dt>
      <dd>{v(w.bz, "nT")}</dd>
      <dt>IMF total field</dt>
      <dd>{v(w.bt, "nT")}</dd>
      <dd className={styles.note}>
        Hourly mean from {minute(w.t)} ({w.minutes} minutes), {w.source}, NOAA SWPC
      </dd>
    </dl>
  );
}

export function SpaceWeatherPanel() {
  const [sw, setSw] = useState<SpaceWeather | null>(spaceWeatherCache.current);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState<Now | null>(null);
  useEffect(() => {
    if (sw) return;
    let live = true;
    ensureSpaceWeather()
      .then((d) => live && setSw(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [sw]);
  useEffect(() => {
    if (!sw) return;
    const update = () => setNow(snapshot(sw, viewStore.getState().t));
    update();
    const timer = setInterval(update, READOUT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sw]);

  if (failed) return <p>The space weather data could not be loaded.</p>;
  if (!sw || !now) return <p>Loading space weather…</p>;
  return (
    <div data-testid="space-weather">
      <p className={styles.type}>At {formatUtc(now.t, 0)}</p>
      {now.storm ? (
        <p data-testid="storm">
          Geomagnetic storm under way: Kp {now.storm.kp} observed (DONKI {now.storm.id.slice(0, 10)})
        </p>
      ) : now.kp ? (
        <p>
          Planetary Kp {now.kp.kp} ({minute(now.kp.iso)}, NOAA SWPC)
        </p>
      ) : null}
      <h3 className={styles.name}>CMEs in flight ({now.cmes.length})</h3>
      {now.cmes.length === 0 ? (
        <p className={styles.note}>None within 2 AU of the Sun at this time.</p>
      ) : (
        <ul>
          {now.cmes.map((x) => (
            <CmeItem key={x.c.id} c={x.c} rAu={x.rAu} />
          ))}
        </ul>
      )}
      {now.flares.length > 0 && (
        <>
          <h3 className={styles.name}>Flares</h3>
          <ul>
            {now.flares.map((f) => (
              <li key={f.id}>
                Began {minute(f.begin)}
                {f.source ? ` at ${f.source}` : ""}, class {f.class ?? "not available"}
              </li>
            ))}
          </ul>
        </>
      )}
      {now.arrivals.length > 0 && (
        <>
          <h3 className={styles.name}>Arrivals within 12 hours</h3>
          <ul data-testid="arrivals">
            {now.arrivals.map((a) => (
              <li key={`${a.kind}-${a.location}-${a.iso}-${a.cme}`}>
                {a.kind === "measured" ? "Shock measured" : "Predicted (WSA-Enlil)"} at {a.location}, {minute(a.iso)}
                {a.glancing ? ", glancing" : ""}
                {a.kp ? `, Kp ${a.kp}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      {(() => {
        const img = sunImageAt(now.t);
        return img ? (
          <p className={styles.note} data-testid="sun-image">
            The Sun up close: SDO/AIA 171 Å image of {img.imageDate.replace("T", " ").replace("Z", " UTC")} (the nearest
            of {SUN_IMAGE_COUNT} in the build), shown on the Sun once it is drawn larger than {MIN_PX} px.
          </p>
        ) : null;
      })()}
      <h3 className={styles.name}>Solar wind at L1</h3>
      {now.wind ? (
        <Wind w={now.wind} />
      ) : (
        <p className={styles.note} data-testid="no-wind">
          No measurement at this time: the build holds NOAA SWPC's measurements from{" "}
          {sw.windSpan.start ? `${minute(sw.windSpan.start)} to ${minute(sw.windSpan.end!)}` : "no span"} only.
        </p>
      )}
      <details>
        <summary>Sources</summary>
        <ul className={styles.note}>
          {sw.credits.map((c) => (
            <li key={c}>{c}</li>
          ))}
          <li>
            Retrieved: DONKI {sw.retrieved.donki}
            {sw.retrieved.cdaw ? `, CDAW ${sw.retrieved.cdaw}` : ""}
            {sw.retrieved.swpc ? `, SWPC ${sw.retrieved.swpc}` : ""}
          </li>
          <li>Analysis kept: {sw.rules.analysis}.</li>
          {sw.rules.cdaw && <li>CDAW match: {sw.rules.cdaw}.</li>}
          {sw.flareNote && <li>{sw.flareNote}.</li>}
          <li>
            Shells move at their DONKI speed from 21.5 solar radii (the cone model); real CMEs slow or speed up on the
            way, so the drawn front can lead or lag the measured arrival.
          </li>
        </ul>
      </details>
    </div>
  );
}
