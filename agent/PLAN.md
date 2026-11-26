# PLAN

Requirements: `VN-<AREA>-NNN` in docs/REQUIREMENTS.md (grep, do not load whole). Milestones and exit criteria: docs/ROADMAP.md.
Milestones: M0 bootstrap · M1 ephemeris and time · M2 scene and camera · M3 spacecraft (MVP) · M4 time control and sharing · M5 scale and education · M6 visual polish · M7 accessibility, mobile, performance · M8 release 1.0 · M9 expansion.
Fixtures (docs/TESTBED.md): F1 testdata/horizons (recorded Horizons responses), F2 testdata/reference (held-out Horizons samples), F3 public/ephem (generated, committed), F4 headless Chromium with SwiftShader WebGL, F5 reference views (URL test params). No live network in tests.
Stack (ADR-0001): TypeScript strict, React 19, three.js + @react-three/fiber, Zustand, Vite 7, Vitest, Playwright; src/core has no DOM, React, three or Node; tools/ is the Node pipeline.

## Now

- [ ] NOW T-004 P0 @phase0 slice: app shell: full-window R3F Canvas with a placeholder Sun, top bar, collapsible side panel, bottom time bar, dark and light themes, About box with version and commit injected at build  req: VN-UI-001, VN-UI-004, VN-GEN-006, VN-GEN-008  files: src/app/App.tsx, src/app/shell/, src/app/about/, vite.config.ts  test: src/app/shell/Shell.test.tsx

## Next

- [ ] T-005 P0 @phase0 slice: Playwright e2e smoke in headless Chromium with SwiftShader WebGL: shell renders, canvas has a WebGL2 context, no request leaves the origin, About shows the commit  req: VN-UI-001, VN-GEN-002  files: playwright.config.ts, e2e/smoke.spec.ts  test: e2e/smoke.spec.ts
- [ ] T-007 P0 @phase0 slice: GitHub Pages: deploy job (actions/upload-pages-artifact + deploy-pages) on main, Vite `base` for the /vastness/ path, scripts/check-pages.sh probes the URL and build.json commit; Pages source is GitHub Actions and the repo is public (done by the user, session 3; OI-3: GitHub Pages)  req: VN-WEB-001  files: .github/workflows/pages.yml, vite.config.ts, scripts/check-pages.sh  test: bash scripts/check-pages.sh

## Later

### M1 ephemeris and time

- [ ] T-011 P0 @phase1 slice: time scales: UTC <-> TAI with the IERS Bulletin C leap-second table, TT, TDB (periodic term), Julian dates, ISO parse and format; reference values from the Astronomical Almanac and IERS  req: VN-EPH-001  files: src/core/time/scales.ts, src/core/time/leap-seconds.ts  test: src/core/time/scales.test.ts
- [ ] T-012 P0 @phase1 slice: frames, units and constants: ecliptic J2000 vectors, IAU 2012 au, c, body radii and GM with sources; the one ecliptic-to-three.js (z-up to y-up) conversion  req: VN-SCN-001  files: src/core/frames.ts, src/core/constants.ts  test: src/core/frames.test.ts
- [ ] T-013 P0 @phase1 slice: Chebyshev fit (least squares at Chebyshev nodes) and evaluation of position and velocity (Clenshaw and its derivative), no allocation in evaluate  req: VN-EPH-002, VN-EPH-005  files: src/core/ephem/chebyshev.ts  test: src/core/ephem/chebyshev.test.ts
- [ ] T-014 P0 @phase1 slice: binary ephemeris format: writer and reader, header, segment table, format version; docs/EPHEMERIS_FORMAT.md  req: VN-EPH-004, VN-DOC-003  files: src/core/ephem/format.ts, docs/EPHEMERIS_FORMAT.md  test: src/core/ephem/format.test.ts
- [ ] T-015 P0 @phase1 slice: Horizons query builder and response parser (JSON envelope, $$SOE/$$EOE CSV vectors, header fields, error texts); record F1 once with tools/ephem/record.ts (the only live fetch in the task)  req: VN-DAT-001, VN-DAT-004, VN-DAT-007  files: tools/ephem/horizons.ts, tools/ephem/record.ts, testdata/horizons/  test: tools/ephem/horizons.test.ts
- [ ] T-016 P0 @phase1 slice: polite client: serial queue, 1 s spacing, backoff on 503 and network errors, User-Agent, request budget, disk cache keyed by query hash, `--offline`  req: VN-DAT-002, VN-DAT-003  files: tools/ephem/client.ts  test: tools/ephem/client.test.ts
- [ ] T-017 P0 @phase1 slice: adaptive segment fitting: sample, fit, check held-out midpoints, subdivide until tolerance or step limit, per-object tolerance, list of misses  req: VN-EPH-002, VN-EPH-003  files: tools/ephem/fit.ts  test: tools/ephem/fit.test.ts
- [ ] T-018 P0 @phase1 slice: `npm run ephem`: data/bodies.json (Sun, planets, Moon geocentric), chunks by decade, manifest with provenance, deterministic output from a warm cache  req: VN-DAT-005, VN-EPH-010, VN-GEN-010  files: tools/ephem/main.ts, data/bodies.json  test: tools/ephem/main.test.ts
- [ ] T-019 P0 @phase1 slice: `npm run ephem:check`: compare every ephemeris with F2 held-out samples, per-object max error table, non-zero exit over tolerance; record F2  req: VN-EPH-008  files: tools/ephem/check.ts, testdata/reference/  test: tools/ephem/check.test.ts
- [ ] T-020 P0 @phase1 slice: generate and commit Sun, planet and Moon ephemerides 1900-2100 (live run, OI-5) and pass ephem:check at 10 km  req: VN-EPH-003, VN-EPH-006  files: public/ephem/  test: npm run ephem:check
- [ ] T-021 P0 @phase1 slice: runtime ephemeris in core: chunk index, injected loader, lazy chunks, body tree composition (Moon relative to Earth)  req: VN-EPH-005, VN-EPH-009, VN-EPH-010  files: src/core/ephem/ephemeris.ts  test: src/core/ephem/ephemeris.test.ts
- [ ] T-022 P1 @phase1 slice: Standish approximate Keplerian elements as the planet fallback outside coverage, flagged approximate  req: VN-EPH-006  files: src/core/ephem/kepler-approx.ts  test: src/core/ephem/kepler-approx.test.ts
- [ ] T-023 P1 @phase1 slice: evaluation benchmark (vitest bench) for the 2 microsecond budget and a zero-allocation check  req: VN-EPH-005  files: src/core/ephem/ephemeris.bench.ts  test: src/core/ephem/ephemeris.bench.ts
- [ ] T-024 P1 @phase1 slice: docs/DATA_SOURCES.md (Horizons credit, IERS, constants) and a test that every file under data/ and public/ephem/ is listed  req: VN-DOC-002  files: docs/DATA_SOURCES.md  test: tests/docs.test.ts

### M2 scene and camera

- [ ] T-025 P0 @phase2 slice: view store (Zustand): simulation time in TDB seconds, selection, camera target, layers; frame clock advances time  req: VN-TIM-004  files: src/app/store/view.ts  test: src/app/store/view.test.ts
- [ ] T-026 P0 @phase2 slice: floating origin: float64 world positions, camera-relative float32 each frame, logarithmic depth buffer, adaptive near and far  req: VN-SCN-004, VN-CAM-004  files: src/scene/origin.ts, src/scene/Scene.tsx  test: src/scene/origin.test.ts
- [ ] T-027 P0 @phase2 slice: Sun, planets and Moon as plain spheres with true radii at ephemeris positions  req: VN-SCN-001  files: src/scene/bodies/Bodies.tsx  test: src/scene/bodies/bodies.test.ts
- [ ] T-028 P0 @phase2 slice: orbit paths sampled from the ephemeris over one period, faded with distance from the current position, resampled as time moves  req: VN-SCN-002  files: src/core/orbits/sample.ts, src/scene/orbits/  test: src/core/orbits/sample.test.ts
- [ ] T-029 P0 @phase2 slice: screen-space markers and labels with priority declutter (pure layout in core)  req: VN-SCN-003  files: src/core/labels/declutter.ts, src/scene/labels/  test: src/core/labels/declutter.test.ts
- [ ] T-030 P0 @phase2 slice: camera controller: orbit, pan, exponential zoom by mouse, wheel and touch, basic keys; math in core  req: VN-CAM-001  files: src/core/camera/orbit.ts, src/scene/camera/Controls.tsx  test: src/core/camera/orbit.test.ts
- [ ] T-031 P0 @phase2 slice: fly-to on a log-distance curve, duration by log distance (under 4 s); follow mode, released by Escape or pan  req: VN-CAM-002, VN-CAM-003  files: src/core/camera/flyto.ts  test: src/core/camera/flyto.test.ts
- [ ] T-032 P0 @phase2 slice: picking by screen-space distance to markers; selection in the store  req: VN-CAT-005  files: src/scene/pick.ts  test: src/scene/pick.test.ts
- [ ] T-033 P0 @phase2 slice: info panel for bodies: distances from Sun and Earth (km, AU, light-time), speeds, 4 Hz updates, unit preference  req: VN-INF-001, VN-INF-002, VN-INF-004  files: src/core/readouts.ts, src/app/info/InfoPanel.tsx  test: src/core/readouts.test.ts
- [ ] T-034 P0 @phase2 slice: reference views (F5): URL test params fix time and camera; e2e screenshots at Earth-Moon, inner, outer and 150 AU; jitter check (two frames identical)  req: VN-SCN-004, VN-CAM-004  files: src/app/testparams.ts, e2e/scale.spec.ts  test: e2e/scale.spec.ts
- [ ] T-035 P1 @phase2 slice: load budget: bundle size check and first render under throttled network  req: VN-PRF-004  files: scripts/check-size.mjs, e2e/perf.spec.ts  test: e2e/perf.spec.ts

### M3 spacecraft

- [ ] T-036 P0 @phase3 slice: catalog schema and data/catalog.json: the VN-CAT-002 spacecraft (now including JWST) and the bodies, summaries in our own words, sources, status with as-of date  req: VN-CAT-001, VN-CAT-002  files: data/catalog.json, src/core/catalog/schema.ts  test: src/core/catalog/schema.test.ts
- [ ] T-037 P0 @phase3 slice: `ephem check-ids` against horizons_lookup.api (recorded responses in tests)  req: VN-DAT-008  files: tools/ephem/check-ids.ts  test: tools/ephem/check-ids.test.ts
- [ ] T-038 P0 @phase3 slice: heliocentric spacecraft ephemerides from launch to the end of predictions, flyby subdivision, misses listed; generate and commit  req: VN-EPH-003, VN-EPH-007  files: tools/ephem/spacecraft.ts, public/ephem/  test: tools/ephem/spacecraft.test.ts
- [ ] T-039 P1 @phase3 slice: element segments in core: a second segment kind in the format (version bump, docs/EPHEMERIS_FORMAT.md), Chebyshev-fitted osculating elements, Kepler solve to position and velocity, parent-relative composition; tested on synthetic perturbed orbits against a numerical reference  req: VN-EPH-009, VN-EPH-011, VN-EPH-004  files: src/core/ephem/elements.ts, src/core/ephem/format.ts, src/core/ephem/ephemeris.ts, docs/EPHEMERIS_FORMAT.md  test: src/core/ephem/elements.test.ts
- [ ] T-089 P1 @phase3 slice: orbiters in the pipeline: Juno at Jupiter, LRO and CAPSTONE at the Moon; fit position and element segments, keep the smaller within tolerance (2 km lunar), report size and worst error for the whole mission, full mission within 5 MB per object else ±30 days; generate and commit  req: VN-EPH-003, VN-EPH-009, VN-EPH-011  files: tools/ephem/orbiters.ts, public/ephem/  test: tools/ephem/orbiters.test.ts
- [ ] T-090 P1 @phase3 slice: illustrative orbit for an orbiter outside its stored span (typical orbit from the nearest stored elements, marker moving at the right period, labelled illustrative in the scene and the panel)  req: VN-EPH-011, VN-EPH-007  files: src/core/ephem/illustrative.ts, src/scene/spacecraft/  test: src/core/ephem/illustrative.test.ts
- [ ] T-040 P0 @phase3 slice: spacecraft markers; not drawn outside coverage, with the reason for the panel  req: VN-EPH-007, VN-CAT-006  files: src/scene/spacecraft/  test: src/scene/spacecraft/coverage.test.ts
- [ ] T-041 P0 @phase3 slice: trails: past solid, predicted dashed, curvature-adaptive sampling, adjustable range  req: VN-CAT-004  files: src/core/trails/sample.ts, src/scene/trails/  test: src/core/trails/sample.test.ts
- [ ] T-042 P0 @phase3 slice: object list grouped by type with type-ahead search; Enter selects and flies  req: VN-CAT-003  files: src/app/objects/  test: src/app/objects/ObjectList.test.tsx
- [ ] T-043 P0 @phase3 slice: spacecraft info panel: launch, status with as-of, agency, summary, goals, safe links  req: VN-INF-003  files: src/app/info/  test: src/app/info/InfoPanel.test.tsx
- [ ] T-044 P1 @phase3 slice: simple spacecraft model or icon within 10,000 km  req: VN-CAT-006  files: src/scene/spacecraft/Model.tsx  test: e2e/spacecraft.spec.ts
- [ ] T-045 P0 @phase3 slice: e2e agreement with Horizons: three objects at fixed epochs, panel values against F2 within tolerance  req: VN-INF-005  files: e2e/accuracy.spec.ts  test: e2e/accuracy.spec.ts
- [ ] T-046 P1 @phase3 slice: streaming spacecraft chunks with a quiet indicator; no blocking after the first frame  req: VN-UI-005  files: src/app/assets/loader.ts  test: src/app/assets/loader.test.ts
- [ ] T-047 P1 @phase3 slice: `ephem:refresh` and a scheduled workflow (also `workflow_dispatch` for a manual refresh, OI-7) that reports moved objects and opens a pull request; needs-user: Settings > Actions > "Allow GitHub Actions to create pull requests"  req: VN-DAT-006  files: tools/ephem/refresh.ts, .github/workflows/refresh.yml  test: tools/ephem/refresh.test.ts
- [ ] T-091 P1 @phase3 slice: ADR-0007 Earth satellites: CelesTrak GP (OMM JSON) by NORAD number at build time, polite and cached; SGP4 (own port of Vallado's reference, or `satellite.js` by amending ADR-0001's allowlist); TEME to J2000 ecliptic; terms in DATA_SOURCES  req: VN-CAT-007, VN-DAT-009  files: docs/adr/0007-earth-satellites.md, docs/DATA_SOURCES.md  test: tests/docs.test.ts
- [ ] T-092 P1 @phase3 slice: SGP4/SDP4 propagator in the core, checked against Vallado's published test vectors (near-Earth and deep-space, including GEO)  req: VN-CAT-007  files: src/core/sgp4/  test: src/core/sgp4/sgp4.test.ts
- [ ] T-093 P1 @phase3 slice: tools/gp fetch and data/satellites: ISS, Hubble, Tiangong, a few operational Starlink, GOES-East, GOES-West and other geostationary satellites (the agent picks; user can change via WORKINGLIST); provenance with epoch; ISS checked against Horizons (-125544) for one day  req: VN-DAT-009, VN-CAT-007  files: tools/gp/, data/satellites.json, data/catalog.json  test: tools/gp/gp.test.ts
- [ ] T-094 P1 @phase3 slice: Earth satellite layer: markers around Earth when the camera is near, epoch age in the panel, illustrative orbit beyond 14 days from epoch  req: VN-CAT-007  files: src/scene/satellites/  test: src/scene/satellites/satellites.test.ts

### M4 time control and sharing

- [ ] T-048 P0 @phase4 slice: clock: rate ladder, play, pause, reverse, no jump on resume  req: VN-TIM-002, VN-TIM-004  files: src/core/time/clock.ts  test: src/core/time/clock.test.ts
- [ ] T-049 P0 @phase4 slice: time bar: picker in UTC or local, play controls, rate, Now  req: VN-TIM-001, VN-TIM-003  files: src/app/time/  test: src/app/time/TimeBar.test.tsx
- [ ] T-050 P1 @phase4 slice: timeline scrubber with the selected object's coverage and catalog events  req: VN-TIM-005  files: src/app/time/Timeline.tsx  test: src/app/time/Timeline.test.tsx
- [ ] T-051 P0 @phase4 slice: URL fragment codec for the view state (versioned, compact, validated) and store sync  req: VN-UI-002  files: src/core/share/fragment.ts, src/app/store/url-sync.ts  test: src/core/share/fragment.test.ts
- [ ] T-052 P0 @phase4 slice: Share button (clipboard) and restore on load; e2e round trip  req: VN-WEB-002  files: src/app/share/  test: e2e/share.spec.ts
- [ ] T-053 P1 @phase4 slice: preset views  req: VN-CAM-005  files: src/core/camera/presets.ts  test: src/core/camera/presets.test.ts

### M5 scale and education

- [ ] T-054 P0 @phase5 slice: scale mapping (pure): true and exaggerated, per-class factors, moons pushed out; property test that nothing overlaps  req: VN-SCL-002  files: src/core/scale/mapping.ts  test: src/core/scale/mapping.test.ts
- [ ] T-055 P0 @phase5 slice: true-scale mode with markers and labels off; animated switch that keeps the selection framed  req: VN-SCL-001, VN-SCL-003  files: src/scene/scale/  test: e2e/scale-modes.spec.ts
- [ ] T-056 P0 @phase5 slice: logarithmic scale indicator with reference marks  req: VN-SCL-004  files: src/core/scale/indicator.ts, src/app/scale/ScaleBar.tsx  test: src/core/scale/indicator.test.ts
- [ ] T-057 P1 @phase5 slice: distance callouts to the Sun and Earth  req: VN-SCL-005  files: src/scene/callouts/  test: src/scene/callouts/callouts.test.ts
- [ ] T-058 P1 @phase5 slice: light-speed pulse layer  req: VN-SCL-007  files: src/scene/pulse/  test: src/scene/pulse/pulse.test.ts
- [ ] T-059 P0 @phase5 slice: overlay engine for "How vast is it?": steps drive camera, time and layers; skip; keyboard  req: VN-SCL-006  files: src/app/tour/  test: src/app/tour/Tour.test.tsx
- [ ] T-060 P1 @phase5 slice: tour content in docs/content/tour.md wired into steps; needs-user: review of the texts  req: VN-SCL-006  files: docs/content/tour.md, src/app/tour/steps.ts  test: src/app/tour/steps.test.ts

### M6 visual polish

- [ ] T-061 P0 @phase6 slice: emissive Sun with configurable glow; the Sun as the only light  req: VN-SCN-005  files: src/scene/sun/  test: e2e/visual.spec.ts
- [ ] T-062 P0 @phase6 slice: textures (NASA public domain or CC BY with credit, OI-8) with tiers and plain fallback; every texture listed with licence and a size budget  req: VN-SCN-006, VN-DOC-002  files: public/textures/, src/scene/bodies/materials.ts, docs/DATA_SOURCES.md  test: tests/assets.test.ts
- [ ] T-063 P1 @phase6 slice: Saturn's rings  req: VN-SCN-006  files: src/scene/bodies/Rings.tsx  test: e2e/visual.spec.ts
- [ ] T-064 P0 @phase6 slice: star background: bright-star catalog to magnitude 6.5 converted at build time to a binary point set in the ecliptic frame  req: VN-SCN-007  files: tools/stars/build.ts, public/stars.bin, src/scene/stars/  test: tools/stars/build.test.ts
- [ ] T-065 P2 @phase6 slice: optional dimmable Milky Way image  req: VN-SCN-007  files: src/scene/stars/MilkyWay.tsx  test: e2e/visual.spec.ts
- [ ] T-066 P1 @phase6 slice: visual regression baselines for the preset views (SwiftShader, fixed time) for the user's review  req: VN-SCN-005, VN-SCN-006  files: e2e/visual.spec.ts  test: e2e/visual.spec.ts

### M7 accessibility, mobile and performance

- [ ] T-067 P0 @phase7 slice: keyboard map and help dialog  req: VN-ACC-001  files: src/app/keys/  test: e2e/keyboard.spec.ts
- [ ] T-068 P0 @phase7 slice: screen readers: throttled live-region announcements, canvas text alternative  req: VN-ACC-002  files: src/app/a11y/  test: src/app/a11y/announce.test.ts
- [ ] T-069 P0 @phase7 slice: high-contrast theme, large text, axe-core in e2e  req: VN-ACC-003  files: src/app/theme/, e2e/a11y.spec.ts  test: e2e/a11y.spec.ts
- [ ] T-070 P1 @phase7 slice: no-WebGL fallback view  req: VN-ACC-004, VN-GEN-011  files: src/app/fallback/  test: e2e/no-webgl.spec.ts
- [ ] T-071 P0 @phase7 slice: reduced motion: instant fly-to, no auto-rotation  req: VN-CAM-006  files: src/core/camera/flyto.ts  test: src/core/camera/flyto.test.ts
- [ ] T-072 P0 @phase7 slice: quality tiers chosen from the device and in settings  req: VN-PRF-003, VN-UI-003  files: src/core/quality.ts, src/app/settings/  test: src/core/quality.test.ts
- [ ] T-073 P0 @phase7 slice: render budgets from renderer.info on the reference scene in CI  req: VN-PRF-002  files: e2e/budget.spec.ts, docs/TESTBED.md  test: e2e/budget.spec.ts
- [ ] T-074 P1 @phase7 slice: touch gestures and bottom sheets under 768 px  req: VN-PRF-005  files: src/scene/camera/Controls.tsx, src/app/shell/  test: e2e/mobile.spec.ts
- [ ] T-075 P1 @phase7 slice: `?stats` frame-time overlay and the 60 fps demonstration; reference machine in docs/TESTBED.md (OI-9 answered)  req: VN-PRF-001  files: src/app/stats/, docs/TESTBED.md  test: e2e/perf.spec.ts
- [ ] T-076 P1 @phase7 slice: browser matrix: Playwright Firefox and WebKit projects  req: VN-GEN-011  files: playwright.config.ts  test: npm run e2e
- [ ] T-077 P2 @phase7 slice: preferences only in localStorage, Reset clears them  req: VN-GEN-008, VN-UI-003  files: src/app/settings/  test: src/app/settings/prefs.test.ts

### M8 release 1.0

- [ ] T-078 P0 @phase8 slice: CSP meta tag and its e2e check  req: VN-GEN-009  files: index.html, e2e/csp.spec.ts  test: e2e/csp.spec.ts
- [ ] T-079 P0 @phase8 slice: PWA: manifest, service worker caching the app and ephemeris chunks by content hash, offline e2e  req: VN-WEB-003  files: src/sw.ts, public/manifest.webmanifest  test: e2e/offline.spec.ts
- [ ] T-080 P0 @phase8 slice: custom domain on Pages with HTTPS and redirect; needs-user: OI-2 domain bought and DNS access  req: VN-WEB-004  files: docs/TESTBED.md, scripts/check-pages.sh  test: bash scripts/check-pages.sh
- [ ] T-081 P1 @phase8 slice: Open Graph metadata and preview images rendered by Playwright per preset  req: VN-WEB-005  files: scripts/og-images.mjs, index.html  test: tests/og.test.ts
- [ ] T-082 P1 @phase8 slice: user guide and Help menu  req: VN-DOC-004  files: docs/USER_GUIDE.md, src/app/help/  test: tests/docs.test.ts
- [ ] T-083 P0 @phase8 slice: v1.0.0: tag, release notes, accuracy summary attached, licence final  req: VN-GEN-007, VN-EPH-008  files: CHANGELOG.md  test: bash scripts/nightly.sh

### M9 expansion

- [ ] T-084 P1 @phase9 slice: dwarf planets and major moons as layers  req: VN-SCN-008  files: data/bodies.json, public/ephem/  test: npm run ephem:check
- [ ] T-085 P1 @phase9 slice: ended missions by catalog entry alone  req: VN-EXT-003  files: data/catalog.json  test: src/core/catalog/schema.test.ts
- [ ] T-086 P2 @phase9 slice: DONKI space weather at build time; needs-user: NASA API key as the Actions secret NASA_API_KEY  req: VN-EXT-001  files: tools/donki/, src/scene/weather/  test: tools/donki/parse.test.ts
- [ ] T-087 P2 @phase9 slice: CNEOS close approaches with SBDB orbits at build time  req: VN-EXT-002  files: tools/neo/  test: tools/neo/parse.test.ts
- [ ] T-088 P2 @phase9 slice: command light-time animation to and from a spacecraft  req: VN-EXT-004  files: src/scene/signal/  test: src/scene/signal/signal.test.ts

## Done

- [x] T-001 P0 @phase0 slice: project skeleton: package.json (Node 22, `engines` >= 20), TypeScript strict, Vite 7, React 19, Vitest, Prettier, .editorconfig, .gitignore (node_modules, dist, .cache, nightly, test-results, playwright-report), scripts test, typecheck, build, e2e, ephem  req: VN-GEN-001  files: package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html, src/main.tsx  test: tests/smoke.test.ts  result: session 1: package.json (Apache-2.0, engines >=20, react 19 only at runtime), strict tsconfig, Vite 7, Vitest 3 projects app/node, Prettier, LICENSE; smoke 4/4, typecheck, build, prettier clean
- [x] T-002 P0 @phase0 slice: guard tests: src/core imports no DOM, React, three or `node:*` and uses no window/document/process; no fetch, XMLHttpRequest, WebSocket, EventSource or sendBeacon outside src/app/assets/loader.ts and src/sw.ts; no eval, new Function, string timers or computed import()  req: VN-GEN-002, VN-GEN-003, VN-GEN-004  files: tests/guards.test.ts  test: tests/guards.test.ts  result: session 2: tests/guards.test.ts (rules proved on synthetic violations, then run over src/ and tools/; comments stripped); 15/15 unit, typecheck, prettier clean
- [x] T-003 P0 @phase0 slice: runtime dependency check: allowlist from ADR-0001, licence of each, THIRD_PARTY_NOTICES.txt generated for the bundle  req: VN-GEN-005, VN-GEN-007  files: scripts/check-deps.mjs, THIRD_PARTY_NOTICES.txt  test: tests/check-deps.test.ts  result: session 3: scripts/check-deps.mjs (allowlist parsed from ADR-0001, lock-file runtime packages, permissive-licence check, deterministic THIRD_PARTY_NOTICES.txt; `npm run check-deps`), Vite plugin emits the notices into dist; 22/22 unit, typecheck, prettier, build clean
- [x] T-010 P1 @phase0 slice: README (what, run, data, licence) and LICENSE (Apache-2.0, OI-1) with NOTICE; a docs test that LICENSE, NOTICE and package.json agree  req: VN-DOC-001, VN-GEN-007  files: README.md, LICENSE, NOTICE, package.json  test: tests/docs.test.ts  result: session 3: NOTICE (author credit, keep-NOTICE, mark-changes, no name grant), README licence and run sections, package.json repository; build ships LICENSE, NOTICE, THIRD_PARTY_NOTICES.txt; tests/docs.test.ts 4/4, 26/26 unit
- [x] T-006 P0 @phase0 slice: CI: .github/workflows/ci.yml (typecheck, unit, build, e2e with Playwright Chromium, npm cache, concurrency cancel); a status badge in README; check-env reports the last run  req: VN-WEB-001  files: .github/workflows/ci.yml, docs/TESTBED.md  test: gh run list --workflow ci.yml --branch main --limit 1 shows success  result: session 3: .github/workflows/ci.yml (npm ci, check-deps, typecheck, format, unit, build; Playwright e2e gated on playwright.config.ts until T-005), README badge, TESTBED CI section, check-env prints the last run; first run 45905421969 success; tests/ci.test.ts 3/3
- [x] T-008 P0 @phase0 slice: nightly release (Escapement's pattern): scripts/nightly-build.sh (web zip, docs zip, build.json, SHA256SUMS; deterministic zips), .github/workflows/nightly.yml replacing the `nightly` pre-release on each push to main, scripts/nightly.sh waits for the run at HEAD with gh and checks tag, files and checksums  req: VN-DOC-005, VN-GEN-010  files: scripts/nightly-build.sh, scripts/nightly.sh, .github/workflows/nightly.yml  test: tests/nightly-build.test.ts  result: session 3: scripts/nightly-build.sh (web zip with LICENSE/NOTICE/notices, docs zip, build.json with sorted keys, SHA256SUMS; byte-identical across builds), .github/workflows/nightly.yml, scripts/nightly.sh (checks tag, pre-release, sums, build.json, web zip contents); tests/nightly-build.test.ts 6/6, 35/35 unit
- [x] T-009 P1 @phase0 slice: LAN deploy: scripts/deploy-web.sh builds and serves dist on port 8770 (seeded; check it against the first real build) and the Windows portproxy note  req: VN-WEB-001  files: scripts/deploy-web.sh, docs/TESTBED.md  test: bash scripts/deploy-web.sh --status  result: session 3: deploy-web.sh checked on the first real build: local and windows localhost 200 (index, assets, LICENSE, NOTICE, notices), --status ok; LAN 000 until the one-time portproxy for 8770 (needs-user, TESTBED)
