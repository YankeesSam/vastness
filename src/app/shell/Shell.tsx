import { useEffect, useState } from "react";
import { SceneView } from "../../scene/SceneView";
import { About } from "../about/About";
import { loadPrefs, resetPrefs, savePrefs, type Prefs } from "../prefs";
import styles from "./Shell.module.css";
import { TimeBar } from "./TimeBar";

// VN-UI-001: full-window 3D view under a top bar (search, time, scale mode, menu), a collapsible side panel
// (object list, info panel) and a bottom time bar. The search, scale and panel contents are placeholders until
// their tasks (T-042, T-033, M5).
export function Shell() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [panelOpen, setPanelOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

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
        <input className={styles.search} type="search" placeholder="Search objects" aria-label="Search objects" />
        <label className={styles.scale}>
          <span>Scale</span>
          <select aria-label="Scale mode" defaultValue="true">
            <option value="true">True scale</option>
          </select>
        </label>
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
          <p className={styles.muted}>Sun</p>
        </section>
        <section aria-label="Info">
          <h2>Info</h2>
          <p className={styles.muted}>Select an object to see its details.</p>
        </section>
      </aside>

      <TimeBar className={styles.bottom} />

      {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
