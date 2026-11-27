import { useEffect, useState } from "react";
import { TRAIL_RANGES_DAYS, TRAIL_WHOLE } from "../../core/trails/sample";
import { DRAWN_BODIES } from "../../scene/bodies/positions";
import { CATALOG } from "../catalog";
import { ObjectList, ObjectSearch } from "../objects/ObjectList";
import { SceneView } from "../../scene/SceneView";
import { About } from "../about/About";
import { LoadingIndicator } from "../assets/LoadingIndicator";
import { InfoPanel } from "../info/InfoPanel";
import { Share } from "../share/Share";
import { loadPrefs, resetPrefs, savePrefs, type Prefs } from "../prefs";
import { useView, viewStore } from "../store/view";
import styles from "./Shell.module.css";
import { SelectionTimeline } from "../time/Timeline";
import { TimeBar } from "../time/TimeBar";

// VN-UI-001: full-window 3D view under a top bar (search, time, scale mode, menu), a collapsible side panel
// (object list, info panel) and a bottom time bar. Choosing an object selects it and flies the camera to it
// (VN-CAM-002); the info panel shows its read-outs (VN-INF-001). The search and scale are placeholders until their
// tasks (T-042, M5).
/** The Sun, planets and Moon in the order they are listed (from the Sun outwards). */
const OBJECT_ORDER = DRAWN_BODIES.map((b) => b.horizonsId);

const rangeLabel = (d: number): string =>
  d === TRAIL_WHOLE ? "Whole coverage" : d >= 365 ? `${d / 365} year${d === 365 ? "" : "s"}` : `${d} days`;

/** VN-CAT-003, VN-CAM-002: choosing an object selects it and flies the camera there. */
function chooseObject(id: number): void {
  viewStore.getState().select(id);
  viewStore.getState().setTarget(id);
}

/** VN-CAT-004: how far back and ahead spacecraft trails reach. */
function TrailRangeSelect() {
  const days = useView((s) => s.trailDays);
  return (
    <label>
      Back and ahead{" "}
      <select
        aria-label="Trail range"
        value={String(days)}
        onChange={(e) => viewStore.getState().setTrailDays(Number(e.target.value))}
      >
        {TRAIL_RANGES_DAYS.map((d) => (
          <option key={d} value={String(d)}>
            {rangeLabel(d)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Shell() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [panelOpen, setPanelOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const selection = useView((s) => s.selection);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  const update = (next: Prefs) => {
    savePrefs(next);
    setPrefs(next);
  };
  const choose = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className={styles.shell}>
      <div className={styles.view}>
        <SceneView />
      </div>

      <header className={styles.top}>
        <button
          type="button"
          aria-label="Side panel"
          aria-expanded={panelOpen}
          aria-controls="side-panel"
          onClick={() => setPanelOpen((o) => !o)}
        >
          ☰
        </button>
        <span className={styles.title}>Vastness</span>
        <LoadingIndicator />
        <ObjectSearch
          className={styles.search}
          objects={CATALOG.objects}
          order={OBJECT_ORDER}
          query={query}
          onQuery={(q) => {
            setQuery(q);
            if (q !== "") setPanelOpen(true);
          }}
          onChoose={chooseObject}
        />
        <label className={styles.scale}>
          <span>Scale</span>
          <select aria-label="Scale mode" defaultValue="true">
            <option value="true">True scale</option>
          </select>
        </label>
        <Share />
        <div className={styles.menuWrap}>
          <button
            type="button"
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ⋮
          </button>
          {menuOpen && (
            <ul className={styles.menu} role="menu">
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={choose(() => update({ ...prefs, theme: prefs.theme === "dark" ? "light" : "dark" }))}
                >
                  {prefs.theme === "dark" ? "Light theme" : "Dark theme"}
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={choose(() => setPrefs(resetPrefs()))}>
                  Reset preferences
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={choose(() => setAboutOpen(true))}>
                  About Vastness
                </button>
              </li>
            </ul>
          )}
        </div>
      </header>

      <aside id="side-panel" className={styles.side} aria-label="Side panel" hidden={!panelOpen}>
        <section aria-label="Objects">
          <h2>Objects</h2>
          <ObjectList
            objects={CATALOG.objects}
            order={OBJECT_ORDER}
            query={query}
            selection={selection}
            onChoose={chooseObject}
          />
        </section>
        <section aria-label="Trails">
          <h2>Trails</h2>
          <TrailRangeSelect />
        </section>
        <section aria-label="Info">
          <h2>Info</h2>
          {selection === null ? (
            <p className={styles.muted}>Select an object to see its details.</p>
          ) : (
            <InfoPanel selection={selection} units={prefs.units} onUnits={(units) => update({ ...prefs, units })} />
          )}
        </section>
      </aside>

      <TimeBar className={styles.bottom}>
        <SelectionTimeline />
      </TimeBar>

      {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
