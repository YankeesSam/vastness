import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { PRESETS, presetCamera } from "../../core/camera/presets";
import { TRAIL_RANGES_DAYS, TRAIL_WHOLE } from "../../core/trails/sample";
import { DRAWN_BODIES } from "../../scene/bodies/positions";
import { CATALOG } from "../catalog";
import { OBJECT_SEARCH_ID, ObjectList, ObjectSearch } from "../objects/ObjectList";
import { Announcements, DescribedView } from "../a11y/Announcements";
import { HelpDialog } from "../keys/HelpDialog";
import { useShortcuts } from "../keys/useShortcuts";
import { SceneView } from "../../scene/SceneView";
import { About } from "../about/About";
import { LoadingIndicator } from "../assets/LoadingIndicator";
import { InfoPanel } from "../info/InfoPanel";
import { PulseControl } from "../scale/PulseControl";
import { ScaleBar } from "../scale/ScaleBar";
import { LayerSwitches, ScaleNote, ScaleSelect } from "../scale/ScaleControls";
import { Share } from "../share/Share";
import { SkyControls } from "../sky/SkyControls";
import { bindSkyPrefs, createPrefsStore, type Prefs } from "../settings/prefs";
import { useView, viewStore } from "../store/view";
import styles from "./Shell.module.css";
import { SelectionTimeline } from "../time/Timeline";
import { TimeBar } from "../time/TimeBar";

// VN-UI-001: full-window 3D view under a top bar (search, time, scale mode, menu), a collapsible side panel
// (object list, info panel) and a bottom time bar. Choosing an object selects it and flies the camera to it
// (VN-CAM-002); the info panel shows its read-outs (VN-INF-001). Scale mode and layers: VN-SCL-001, VN-SCL-002.
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
  // VN-GEN-008: preferences in localStorage, read once per page load; the sky settings follow them both ways
  const [prefsStore] = useState(createPrefsStore);
  const prefs = useStore(prefsStore, (s) => s.prefs);
  useEffect(() => bindSkyPrefs(viewStore, prefsStore), [prefsStore]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const selection = useView((s) => s.selection);

  // VN-ACC-001: app shortcuts (the camera's keys are in the scene's Controls).
  useShortcuts({
    search: () => {
      setPanelOpen(true);
      document.getElementById(OBJECT_SEARCH_ID)?.focus();
    },
    togglePlay: () => viewStore.getState().togglePlay(),
    now: () => viewStore.getState().now(),
    follow: () => {
      const id = viewStore.getState().selection;
      if (id !== null) viewStore.getState().setTarget(id);
    },
    help: () => setHelpOpen(true),
  });

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);
  useEffect(() => {
    // VN-ACC-003: large text scales every rem in the interface
    document.documentElement.dataset.text = prefs.largeText ? "large" : "normal";
  }, [prefs.largeText]);

  const update = (next: Prefs) => prefsStore.getState().update(next);
  const choose = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className={styles.shell}>
      <DescribedView className={styles.view}>
        <SceneView />
      </DescribedView>
      <Announcements />

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
        <ScaleSelect className={styles.scale} />
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
                  onClick={choose(() => update({ ...prefs, theme: prefs.theme === "light" ? "dark" : "light" }))}
                >
                  {prefs.theme === "light" ? "Dark theme" : "Light theme"}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={prefs.theme === "contrast"}
                  onClick={choose(() => update({ ...prefs, theme: prefs.theme === "contrast" ? "dark" : "contrast" }))}
                >
                  High contrast
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={prefs.largeText}
                  onClick={choose(() => update({ ...prefs, largeText: !prefs.largeText }))}
                >
                  Large text
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={choose(() => prefsStore.getState().reset())}>
                  Reset preferences
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={choose(() => setHelpOpen(true))}>
                  Keyboard shortcuts
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
        <section aria-label="Views">
          <h2>Views</h2>
          <ul className={styles.objects}>
            {PRESETS.map((p) => (
              <li key={p.id}>
                {/* VN-CAM-005: a preset places the camera at once and follows its centre */}
                <button type="button" onClick={() => viewStore.getState().setCamera(presetCamera(p.id))}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
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
        <section aria-label="Layers">
          <h2>Layers</h2>
          <LayerSwitches className={styles.objects} />
        </section>
        <section aria-label="Sky">
          <h2>Sky</h2>
          <SkyControls className={styles.objects} />
        </section>
        <section aria-label="Light pulse">
          <h2>Light pulse</h2>
          <PulseControl />
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

      <div className={styles.overlay}>
        <ScaleNote className={styles.note} />
        <ScaleBar />
      </div>

      <TimeBar className={styles.bottom} zone={prefs.zone} onZone={(zone) => update({ ...prefs, zone })}>
        <SelectionTimeline />
      </TimeBar>

      {aboutOpen && <About onClose={() => setAboutOpen(false)} />}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
