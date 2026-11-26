# Roadmap

Milestones in dependency order: the data and the time model first, headless and fully tested, because every pixel stands on them; then the scene and camera that make the MVP; then the spacecraft, time, scale and education that make the experience; then polish, accessibility and performance; then release and expansion. The order is open to the user (OI-10). Tasks live in agent/PLAN.md; requirements in docs/REQUIREMENTS.md.

Mapping to the design document's phases: Phase 1 MVP = M0..M3 (the design's "simple spacecraft markers" arrive with real trajectories in M3). Phase 2 Core Experience = M4..M5. Phase 3 Polish and Expansion = M6..M9.

## M0 Bootstrap

**Goal:** the project skeleton, the guards, an app shell with an empty 3D view, CI on GitHub Actions, GitHub Pages, the nightly and the LAN deploy.

- **Exit criteria:**
  - `npm ci && npm test && npm run build` is green; the About box shows version and commit (VN-GEN-006).
  - Guard tests pass: core free of DOM, React, three.js and Node; no network APIs or dynamic code in src; runtime dependency check with licences (VN-GEN-002..005).
  - The app shell opens in both themes with a WebGL canvas showing a placeholder Sun; a Playwright smoke test passes in headless Chromium (VN-UI-001, VN-UI-004).
  - GitHub Actions runs typecheck, unit tests, build and the smoke test on every push; Pages serves main (VN-WEB-001).
  - The handoff publishes and checks the `nightly` release and serves the build on the LAN (VN-DOC-005).

## M1 Ephemeris and time

**Goal:** Horizons in, compact checked ephemerides out, and a core that evaluates them fast and right. No scene changes.

- **Exit criteria:**
  - Time scale conversions pass reference values from the IERS and the Astronomical Almanac (VN-EPH-001).
  - The pipeline fetches politely, caches, parses and reports Horizons errors; tests use recorded responses only (VN-DAT-001..005, 007).
  - Planets, Sun and Moon ephemerides for 1900-2100 are generated, committed and pass the accuracy check at 10 km (VN-EPH-002..004, 006, 008, 010).
  - Evaluation meets the speed and allocation budget (VN-EPH-005).
  - Two pipeline runs on the same cache give byte-identical files (VN-GEN-010).
  - docs/EPHEMERIS_FORMAT.md and docs/DATA_SOURCES.md are written (VN-DOC-002, 003).

## M2 Scene and camera

**Goal:** the solar system on screen at true positions, explorable from metres to hundreds of AU, with an info panel.

- **Exit criteria:**
  - Sun, planets and Moon at ephemeris positions with true radii, orbits and decluttered labels (VN-SCN-001..003).
  - Floating origin and logarithmic depth: no jitter or z-fighting in the e2e screenshots at the Earth-Moon, inner, outer and 150 AU views (VN-SCN-004, VN-CAM-004).
  - Orbit, pan, zoom, fly-to and follow work by mouse, touch and keyboard basics (VN-CAM-001..003).
  - The info panel shows distances, light-time and speeds for planets (VN-INF-001, 002, 004).
  - First-render budget holds (VN-PRF-004).

## M3 Spacecraft

**Goal:** the deep-space fleet with real trajectories and mission information. With M3 the MVP is complete.

- **Exit criteria:**
  - The twelve catalog spacecraft have verified IDs, ephemerides within tolerance (flyby segments listed when they miss) and catalog entries (VN-CAT-001, 002, VN-DAT-008, VN-EPH-007, 009).
  - Trails past and predicted, adjustable range; markers pickable at any scale; models up close (VN-CAT-004..006).
  - Search and object list; spacecraft info panel; values agree with Horizons in the e2e check (VN-CAT-003, VN-INF-003, 005).
  - The refresh job runs as a scheduled workflow and opens a pull request with the changes (VN-DAT-006).

## M4 Time control and sharing

**Goal:** move through time and share a view.

- **Exit criteria:**
  - Picker, play, pause, reverse, rates, Now, timeline with coverage and events (VN-TIM-001..005).
  - View state in one store mirrored to the URL; Share link round-trips (VN-UI-002, VN-WEB-002).
  - Preset views (VN-CAM-005).

## M5 Scale and education

**Goal:** make the vastness felt.

- **Exit criteria:**
  - True and exaggerated scale, with animated switching and no overlaps (VN-SCL-001..003).
  - Scale indicator, distance callouts, light-speed pulse (VN-SCL-004, 005, 007).
  - The "How vast is it?" overlay, reviewed by the user (VN-SCL-006).

## M6 Visual polish

**Goal:** beautiful, without losing accuracy or speed.

- **Exit criteria:**
  - Sun glow and lighting, textures, rings, star background, all sources in docs/DATA_SOURCES.md (VN-SCN-005..007).
  - Visual regression screenshots updated and reviewed by the user.

## M7 Accessibility, mobile and performance

**Goal:** everyone, on any reasonable device.

- **Exit criteria:**
  - Keyboard map, screen-reader announcements, high contrast, axe clean, no-WebGL fallback (VN-ACC-001..004, VN-CAM-006).
  - Quality tiers, touch, bottom sheets; budgets in CI; 60 fps demonstrated on the reference machine (VN-PRF-001..003, 005).
  - Settings complete; browser matrix checked (VN-UI-003, VN-GEN-011).

## M8 Release 1.0

**Goal:** public, installable, documented.

- **Exit criteria:**
  - CSP, PWA offline, custom domain, social previews (VN-GEN-009, VN-WEB-003..005).
  - User guide; licence and notices final (VN-DOC-004, VN-GEN-007).
  - A tagged v1.0.0 release with the accuracy summary.

## M9 Expansion

**Goal:** more of the solar system, once 1.0 is out.

- **Exit criteria:**
  - Dwarf planets and major moons; ended missions by catalog alone (VN-SCN-008, VN-EXT-003).
  - Space weather and close approaches from build-time data (VN-EXT-001, 002).
  - Command light-time animation (VN-EXT-004).
