# Vastness requirements

Document VN-SRS-001, revision D (draft), 2026-11-26.
Requirement IDs are stable. A retired requirement is struck through and kept; its ID is never reused.

| Rev | Date | Change |
|---|---|---|
| A | 2026-11-26 | Initial baseline, from the Vastness Project Design Document v1.0 (2026-11-26) and the seeding chat; hosted on GitHub (user's choice in the seeding chat) |
| B | 2026-11-26 | Lunar orbiters stored as orbital elements, measured before choosing full mission or window (seeding chat): VN-EPH-003 adds a 2 km tolerance, VN-EPH-009 reworded, new VN-EPH-011, OI-6 reworded |
| C | 2026-11-26 | Open items answered through WORKINGLIST (W-001..W-009): OI-1 Apache-2.0 (VN-GEN-007), OI-3 GitHub Pages, OI-4 list is a minimum plus JWST (VN-CAT-002) and Earth satellites (new VN-CAT-007, VN-DAT-009), OI-5 default kept, OI-7 build time plus a manual refresh run (VN-DAT-006), OI-8 NASA public domain and CC BY with credit, OI-9 reference machine recorded (VN-PRF-001), OI-10 order confirmed |
| F | 2026-11-27 | User (session 18, W-014): space weather as storms: VN-EXT-001 widened to DONKI's archive, VN-EXT-005 storm visual, VN-EXT-006 CDAW mass and energy, VN-EXT-007 NOAA SWPC solar wind; ordered after rotation, textures and shadows |
| E | 2026-11-27 | User (session 18, W-011..W-013): VN-SCN-009 body orientation and spin (IAU rotation models), VN-SCN-010 eclipse shadows; textures with topographic maps and spacecraft models pulled forward |
| D | 2026-11-26 | User (session 9): positions and orbits come only from Horizons data, never approximated. VN-EPH-006 reworded (no Standish fallback: outside coverage a planet is not drawn and the UI says why), VN-SCN-002 adds that every orbit sample is ephemeris data, loaded after the first render. VN-SCN-006 adds public topographic maps; VN-SCN-008 widens to the major moons of every planet |

## 1. Purpose

Vastness is a free, open-source, browser-based planetarium of the solar system and the robotic spacecraft exploring it. It shows the true scale of the solar system and where human spacecraft are, from authoritative public data (primarily NASA/JPL Horizons), accurately and beautifully. Users pan, zoom and fly anywhere, pick a planet or a probe, see its trajectory, distance, light-time and speed, and move through time.

Two things matter equally: **accuracy** (positions agree with Horizons, the system mission navigators use) and **feeling** (true scale is mostly empty, and the app lets that be felt).

## 2. Scope

In scope
- A heliocentric 3D view of the Sun, the eight planets, the Moon and dwarf planets later; a curated catalog of deep-space spacecraft with past and predicted trajectories.
- A build-time data pipeline that turns Horizons output into compact ephemeris files served with the app (ADR-0002).
- Time control from the past to the end of the predictions, true and exaggerated scale, distance and light-time read-outs, an educational overlay.
- A static web app: hosted, shareable by link, usable offline after the first visit.

Out of scope (non-goals)
- Accounts, user data on a server, comments, analytics, advertising.
- Mission operations accuracy. Vastness shows Horizons positions faithfully; it is not a navigation tool and claims no accuracy beyond its documented tolerances.
- Stars beyond a background sky, galaxies, exoplanets, the night-sky view from a place on Earth (a desktop planetarium's job).
- Native apps. The browser is the only platform.
- Querying Horizons from the browser at run time (ADR-0002); a proxy is a later decision (OI-7).

## 3. Conventions

- **Requirement format:** `VN-<AREA>-NNN` (verification method, milestone). Methods: T test, D demonstration, I inspection, A analysis. P-level priorities live on tasks, not requirements.
- **Body:** the Sun, a planet, a moon, a dwarf planet or a small body. **Spacecraft:** a catalog object with a Horizons ID. **Object:** either.
- **Ephemeris:** the position (and velocity) of an object as a function of time, here as Chebyshev segments (ADR-0002). **Coverage:** the time span an object's ephemeris is valid for.
- **TDB** is the time scale of the ephemerides; **UTC** is the time scale shown to the user (ADR-0003). **J2000** is 2000-01-01T12:00:00 TDB.
- **Frame:** positions are heliocentric (Sun centre, Horizons `500@10`) in the ecliptic and mean equinox of J2000, km and km/s, unless a requirement says otherwise (ADR-0003).
- **The core:** `src/core`, pure TypeScript shared by the app, the workers and the data pipeline: no DOM, no React, no Node API, no three.js.
- **Reference machine:** the user's desktop as recorded in docs/TESTBED.md (OI-9, answered).

## 4. Requirements

### 4.1 General (GEN)

- **VN-GEN-001** (T, M0) Vastness shall run entirely in the browser from static files: no server code, no installation.
- **VN-GEN-002** (T, M0) At run time the app shall request only its own origin's static assets: no CDN, remote fonts, analytics, telemetry, error reporting, Horizons or other API calls. A guard test rejects `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `navigator.sendBeacon` outside the asset loader and the service worker, and the e2e suite fails on any request to another origin.
- **VN-GEN-003** (T, M0) No dynamic code execution: no `eval`, `new Function`, string timers or `import()` of computed URLs (guard test).
- **VN-GEN-004** (T, M0) The core shall not import the DOM, React, three.js or any Node API (guard test on imports and globals).
- **VN-GEN-005** (T, M0) Runtime dependencies are only those ADR-0001 names; a check script fails on any other entry in `dependencies` and lists each one's licence.
- **VN-GEN-006** (T, M0) The version (git tag at build time) and the commit are shown in the About box and in `build.json`.
- **VN-GEN-007** (I, M0) Vastness is open source under the Apache License 2.0 (OI-1): LICENSE and a NOTICE file at the root credit the author, the NOTICE must travel with any copy or derivative, modified files must say they were changed, and the licence grants no use of the Vastness name. Third-party notices for every bundled package ship with the app.
- **VN-GEN-008** (T, M0) No cookies, no local storage of anything identifying; preferences in `localStorage` only (theme, units, quality, last view), cleared by a Reset command.
- **VN-GEN-009** (T, M8) A strict Content Security Policy (`default-src 'self'`, `connect-src 'self'`, no inline script) is set and checked by an e2e test.
- **VN-GEN-010** (T, M1) Build outputs are deterministic: the same inputs give byte-identical ephemeris files, manifests and app bundles (sorted keys, LF, no build timestamps except the commit time).
- **VN-GEN-011** (T, M7) Supported browsers: current Chrome, Edge, Firefox and Safari on desktop; current Safari on iOS and Chrome on Android. WebGL 2 is required; without it the app shows a plain message and the object list with distances (VN-ACC-004).

### 4.2 Data pipeline (DAT)

- **VN-DAT-001** (T, M1) A Node pipeline (`npm run ephem`) queries the Horizons API (`https://ssd.jpl.nasa.gov/api/horizons.api`) for state vectors of each catalog object: heliocentric (`CENTER='500@10'`), ecliptic J2000 (`REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`), km and km/s, TDB.
- **VN-DAT-002** (T, M1) The pipeline is polite: one request at a time, at least 1 s between requests, retries with exponential backoff on HTTP 503 and network errors, a descriptive User-Agent naming the project (no personal data), and a request budget per run.
- **VN-DAT-003** (T, M1) Every raw Horizons response is cached on disk (`.cache/horizons/`, gitignored) keyed by a hash of its query; a rerun with a warm cache makes no request. `--offline` fails instead of fetching.
- **VN-DAT-004** (T, M1) The response parser handles the JSON envelope and the `$$SOE`/`$$EOE` vector table, reports Horizons errors (unknown ID, no ephemeris for the span, ambiguous name) with the query that caused them, and records the header fields that matter: target name, centre, frame, time scale, ephemeris or trajectory source.
- **VN-DAT-005** (T, M1) Each generated ephemeris carries provenance in the manifest: Horizons query, retrieval date (UTC, date only), source named in the response header, coverage, fit tolerance achieved.
- **VN-DAT-006** (T, M3) A refresh job (`npm run ephem:refresh`, also a scheduled GitHub Actions workflow that opens a pull request, and can also be run by hand with `workflow_dispatch`, OI-7) regenerates spacecraft ephemerides whose predictions may have changed and reports which objects moved by more than the fit tolerance since the last commit.
- **VN-DAT-007** (T, M1) Tests never touch the network: unit tests use the recorded responses in testdata/horizons (F1); a test setup makes `fetch` throw.
- **VN-DAT-008** (T, M3) Catalog object IDs are verified against the Horizons lookup API (`horizons_lookup.api`) by the pipeline's `check-ids` command, and a mismatch fails it.
- **VN-DAT-009** (T, M3) The pipeline fetches CelesTrak GP elements (OMM JSON) for the Earth satellites by NORAD catalog number, as politely as Horizons (VN-DAT-002) and cached the same way (VN-DAT-003), and records provenance: element epoch, retrieval date, source (ADR-0007). The refresh job (VN-DAT-006) refreshes them.

### 4.3 Ephemeris and time (EPH)

- **VN-EPH-001** (T, M1) Time scales: conversions between UTC, TAI, TT and TDB, with a leap-second table from IERS Bulletin C, the TDB-TT periodic term (error under 30 microseconds), and Julian dates. Leap seconds after the table's last entry are assumed to be zero and the About box says until when the table is known.
- **VN-EPH-002** (T, M1) Ephemerides are stored as Chebyshev polynomial segments per coordinate (position; velocity is the derivative), fitted to Horizons samples, with segment length chosen adaptively until the error at held-out points (midpoints between samples) is below the object's tolerance.
- **VN-EPH-003** (T, M1) Fit tolerances: 10 km in position for the planets and the Moon over their coverage; 50 km for spacecraft in cruise; 2 km for spacecraft in low orbit around the Moon (so none is drawn below the surface); spacecraft segments around flybys, orbit insertions and manoeuvres are subdivided until the same tolerance holds or the sample step limit is reached, and any segment that misses it is listed in the manifest.
- **VN-EPH-004** (T, M1) An ephemeris file is a compact binary (little-endian float64 coefficients, a fixed header with object ID, coverage, degree and segment table, a format version) with a documented layout (docs/EPHEMERIS_FORMAT.md), and loads without parsing text.
- **VN-EPH-005** (T, M1) Evaluating an object at a TDB time returns position and velocity in under 2 microseconds on the reference machine (amortised over 1e5 calls) and allocates nothing in steady state.
- **VN-EPH-006** (T, M1) Planet coverage is 1900-01-01 to 2100-01-01 by default (OI-5). Nothing is approximated: outside the coverage a planet (and its orbit) is not drawn and the UI says that no data is stored for that time. (Rev D; before it, a Standish approximate-elements fallback.)
- **VN-EPH-007** (T, M3) Spacecraft coverage runs from launch (or the first epoch Horizons has) to the end of Horizons' predictions. Outside it the spacecraft is not drawn and its info panel says why (before launch, beyond the predictions, mission ended).
- **VN-EPH-008** (A, M1) Accuracy is shown, not assumed: an accuracy report (`npm run ephem:check`) compares every ephemeris against Horizons reference samples not used in the fit (F2) and fails when any object exceeds its tolerance. The report's summary is published with each release.
- **VN-EPH-009** (T, M3) Moons are stored relative to their planet (the Moon geocentric, later moons planetocentric) and spacecraft orbiting a body relative to that body (Juno to Jupiter, LRO and CAPSTONE to the Moon), and combined at evaluation time.
- **VN-EPH-011** (T, M3) Orbiters may be stored as element segments instead of position segments: osculating orbital elements relative to the parent (semi-major axis, eccentricity, inclination, node, argument of periapsis, and mean anomaly minus mean motion times time) fitted with Chebyshev polynomials, the position computed by solving Kepler's equation. The pipeline fits both kinds for each orbiter, keeps the smaller that meets the tolerance, and reports size and worst error against Horizons for the whole mission. For lunar orbiters it keeps the whole mission when it fits a 5 MB budget per object, else a window of ±30 days around the build (OI-6); outside the stored span the orbiter is drawn on an illustrative orbit labelled as such, never at an invented exact position.
- **VN-EPH-010** (T, M1) Ephemeris files are split by object and by time chunk; the app loads the Sun, planets and Moon for the current decade first (under 1 MB) and the rest on demand.

### 4.4 Scene (SCN)

- **VN-SCN-001** (T, M2) The Sun, the eight planets and the Moon are drawn at their ephemeris positions for the current time, with their true mean radii from the IAU/NASA constants table (src/core/constants, sources cited).
- **VN-SCN-002** (T, M2) Orbits of the planets and the Moon are drawn as paths sampled from the ephemeris (Horizons data, never ellipses or approximate elements) over one orbital period centred on the current time, slid to stay inside the coverage when the centred period would leave it, and faded with distance from the current position. Chunks the paths need beyond those for the current time load after the first render.
- **VN-SCN-003** (T, M2) Every object has a screen-space marker and label that stay readable at any distance, declutter by priority when they overlap, and can be hidden (VN-SCL-001).
- **VN-SCN-004** (T, M2) The renderer uses a floating origin and a logarithmic depth buffer (ADR-0004) so that objects from 1 m to 200 AU from the camera render without z-fighting or jitter; positions are kept in float64 on the CPU and made camera-relative before reaching the GPU.
- **VN-SCN-005** (T, M6) The Sun is an emissive sphere with a glow whose brightness and size are configurable; the Sun is the only light source and lights bodies by distance.
- **VN-SCN-006** (T, M6) Planet and Moon textures (2k by default, 4k on the high quality tier) and Saturn's rings, plus topographic maps (shaded relief or colour-coded elevation from public NASA, USGS or NOAA data, for example MOLA for Mars, LOLA for the Moon, ETOPO for Earth) that can be switched on over the bodies, with sources and licences in docs/DATA_SOURCES.md; plain coloured spheres when textures are off or not yet loaded.
- **VN-SCN-007** (T, M6) A background sky of real stars (a bright-star catalog to magnitude 6.5, positions in the same frame) and an optional Milky Way image, both dimmable.
- **VN-SCN-009** (T, M6) Each textured body is oriented and spins by the IAU WGCCRE rotation model (pole right ascension and declination, prime meridian W0 and rate, with their secular and periodic terms), evaluated at the simulation time, so the texture's prime meridian and the terminator match reality; the Moon by the IAU model (or its mean-Earth frame) until a libration source is chosen.
- **VN-SCN-010** (T, M6) Eclipse shadows from the Sun's true direction: a planet's shadow on its rings and on its moons (Saturn on its rings, Earth on the Moon in a lunar eclipse), the rings' shadow on Saturn, and a moon's shadow on its planet (the Moon on Earth in a solar eclipse), with umbra and penumbra from the Sun's angular size.
- **VN-SCN-008** (T, M9) Dwarf planets (Ceres, Pluto, Eris, Haumea, Makemake) and the major moons of every planet (Mars, Jupiter, Saturn, Uranus, Neptune, Pluto), positioned from Horizons data like the planets, as optional layers.

### 4.5 Camera (CAM)

- **VN-CAM-001** (T, M2) Orbit, pan and zoom with mouse, trackpad and touch; zoom is exponential so one wheel step changes the distance by a fixed ratio from metres to light-days.
- **VN-CAM-002** (T, M2) Fly-to: selecting an object moves the camera to frame it, with a duration that grows with the logarithm of the distance travelled (under 4 s), easing on a logarithmic distance curve so the move never skips past the target or lingers in empty space.
- **VN-CAM-003** (T, M2) Follow: the camera keeps its offset to the selected object as time runs; Escape or a pan releases it.
- **VN-CAM-004** (T, M2) Multi-scale: near and far clip planes adapt to the distance to the focus so that a spacecraft 1 km away and the Sun 150 million km away render in the same frame (VN-SCN-004).
- **VN-CAM-005** (T, M4) Preset views: whole system (top-down ecliptic), inner planets, outer planets, the heliopause region (Voyagers), Earth-Moon.
- **VN-CAM-006** (T, M7) With `prefers-reduced-motion`, fly-to is an instant cut and auto-rotation is off.

### 4.6 Catalog and spacecraft (CAT)

- **VN-CAT-001** (T, M3) A catalog file (`data/catalog.json`, schema-checked) lists each object: Horizons ID, names, type, parent, launch date, mission status with an "as of" date, agency, one-paragraph summary in our own words, primary science goals, source links, colour and marker priority.
- **VN-CAT-002** (T, M3) The initial spacecraft are Voyager 1, Voyager 2, New Horizons, Parker Solar Probe, Juno, Europa Clipper, JUICE, Lucy, Psyche, OSIRIS-APEX, LRO, CAPSTONE and the James Webb Space Telescope (at Sun-Earth L2). The list is a minimum (OI-4); Earth satellites are VN-CAT-007.
- **VN-CAT-003** (T, M3) A searchable object list grouped by type (Sun and planets, moons, spacecraft), with type-ahead by any name; Enter selects and flies to.
- **VN-CAT-004** (T, M3) Spacecraft trails: the past trajectory as a solid line and the predicted one dashed, over an adjustable range (default 1 year back, 1 year ahead; up to the whole coverage), sampled adaptively by curvature so flybys stay smooth.
- **VN-CAT-005** (T, M3) Clicking or tapping a marker selects the object; picking uses screen-space distance to markers so a sub-pixel object can be picked.
- **VN-CAT-006** (T, M3) Spacecraft are drawn as markers at every scale and as a simple model or icon when the camera is within 10,000 km.
- **VN-CAT-007** (T, M3) Earth satellites (OI-4): the ISS, Hubble, Tiangong, a few operational Starlink satellites, geostationary satellites (GOES-East, GOES-West and others), and a few others the catalog names by NORAD number. They are propagated in the app with SGP4 from build-time GP elements (VN-DAT-009), drawn as an Earth-centred layer when the camera is near Earth, and the panel shows the element epoch; more than 14 days from the epoch a satellite is drawn on an illustrative orbit labelled as such.

### 4.7 Info panel (INF)

- **VN-INF-001** (T, M2) Selecting an object opens an info panel with its name, type and, for the current time: distance from the Sun and from Earth (km and AU, and light-time), heliocentric speed and speed relative to Earth (km/s).
- **VN-INF-002** (T, M2) One-way light-time from Earth (distance / c, c = 299,792.458 km/s) is shown as h m s, with a short explanation of what it means for commanding the spacecraft.
- **VN-INF-003** (T, M3) For spacecraft the panel adds launch date, mission status (with its "as of" date), agency, summary, science goals and source links (opened in a new tab, `rel="noopener noreferrer"`).
- **VN-INF-004** (T, M2) Read-outs update at most 4 times a second while time runs and use the unit preferences (km, AU, miles; UTC or local time).
- **VN-INF-005** (T, M3) Values agree with Horizons for the same epoch within the fit tolerance (VN-EPH-003), checked by an e2e test on three objects at fixed epochs.

### 4.8 Time control (TIM)

- **VN-TIM-001** (T, M4) A date and time picker (UTC by default, local time as an option) moves to any instant in the planets' coverage; times outside a spacecraft's coverage are allowed and explained (VN-EPH-007).
- **VN-TIM-002** (T, M4) Play, pause and reverse with rates from real time to 1 year per second, in steps a user can name (1 s/s, 1 min/s, 1 h/s, 1 day/s, 1 week/s, 1 month/s, 1 year/s).
- **VN-TIM-003** (T, M4) A Now button jumps to the current UTC time and plays at real time.
- **VN-TIM-004** (T, M4) Simulation time is a float64 TDB seconds value advanced by the frame clock; pausing and resuming never jumps, and the shown time is UTC (VN-EPH-001).
- **VN-TIM-005** (T, M4) A timeline scrubber shows the coverage of the selected object and marks its events (launch, flybys, arrivals) from the catalog.

### 4.9 Scale and education (SCL)

- **VN-SCL-001** (T, M5) True-scale mode: true radii and distances; markers and labels can be turned off so the emptiness shows.
- **VN-SCL-002** (T, M5) Exaggerated-scale mode: body radii enlarged by per-class factors chosen so no body overlaps another or its moons (moons pushed out to clear the enlarged parent), with an on-screen note of the factors. The mode is a pure function from true positions and radii to drawn ones (ADR-0004).
- **VN-SCL-003** (T, M5) Switching modes animates over 1 s (instant with reduced motion) and keeps the selected object in frame.
- **VN-SCL-004** (T, M5) A logarithmic scale indicator shows the width of the view in km, AU and light-time, with a mark for reference distances (Earth-Moon, Earth-Sun, Sun-Neptune, Voyager 1).
- **VN-SCL-005** (T, M5) Distance callouts: a line from the selected object to the Sun and to Earth, labelled with the distance and light-time.
- **VN-SCL-006** (D, M5) "How vast is it?": a guided overlay of short steps that moves the camera and time (light leaving the Sun and reaching each planet at true speed, the scale of the planets beside the gaps, how long Voyager's signal takes), skippable, keyboard-operable, its text in docs/content.
- **VN-SCL-007** (T, M5) A light-speed pulse: an optional expanding sphere from the Sun (or Earth) at the speed of light in simulation time.

### 4.10 Interface (UI)

- **VN-UI-001** (T, M0) The app shell: a full-window 3D view, a top bar (search, time, scale mode, menu), a collapsible side panel (object list, info panel), a bottom time bar; light and dark themes, dark by default.
- **VN-UI-002** (T, M4) The view state (time, rate, selected object, camera, scale mode, layers) is held in one store (Zustand) and mirrored to the URL fragment, so a link reopens the same view (VN-WEB-002).
- **VN-UI-003** (T, M7) Settings: units, time zone display, quality tier, layers (orbits, trails, labels, markers, stars), textures on or off.
- **VN-UI-004** (T, M0) An About box: version, commit, data dates (latest Horizons retrieval, leap-second table), licences, attributions.
- **VN-UI-005** (T, M3) Loading states: the scene shows immediately with the planets; spacecraft ephemerides stream in with a quiet indicator; no blocking spinner after the first frame.

### 4.11 Accessibility (ACC)

- **VN-ACC-001** (T, M7) Every action is reachable by keyboard: Tab through the panels, arrow keys orbit, +/- zoom, `/` search, Space play/pause, `N` now, `F` follow, Escape release; shortcuts listed in a help dialog.
- **VN-ACC-002** (T, M7) Screen readers: the object list and info panel are real DOM with labels; selection changes and arrivals are announced through a polite live region (throttled); the 3D canvas has a text alternative describing the view.
- **VN-ACC-003** (T, M7) A high-contrast theme and a large-text option; DOM interface meets WCAG 2.2 AA, checked by axe-core in the e2e suite.
- **VN-ACC-004** (T, M7) Without WebGL 2 the app still offers the object list, info panel and time control (VN-GEN-011).

### 4.12 Performance and mobile (PRF)

- **VN-PRF-001** (D, M7) 60 fps on the reference machine with the reference scene (all planets, all catalog spacecraft with 2-year trails, labels, stars) at 1080p and at the reference display's native resolution (OI-9, docs/TESTBED.md).
- **VN-PRF-002** (T, M7) Deterministic budgets checked in CI from `renderer.info` on the reference scene: draw calls, triangles and texture memory under the limits in docs/TESTBED.md.
- **VN-PRF-003** (T, M7) Quality tiers (low, medium, high) chosen automatically from the device (pixel ratio cap, texture size, trail sample count, star count), changeable in settings; the low tier keeps 30 fps on a mid-range phone (D).
- **VN-PRF-004** (T, M2) First render under 3 s on a simulated fast 4G connection; initial download (JS, CSS, first ephemeris chunk) under 1.5 MB compressed; textures and spacecraft data load after the first frame.
- **VN-PRF-005** (T, M7) Touch: one finger orbits, two fingers pinch-zoom and pan, tap selects; panels become bottom sheets under 768 px width.

### 4.13 Web and sharing (WEB)

- **VN-WEB-001** (T, M0) The app is built as static files and deployed to GitHub Pages from `main` by GitHub Actions (OI-3); every session's handoff also serves the current build on the LAN.
- **VN-WEB-002** (T, M4) Share: a Share button copies a link with the view in the URL fragment (never sent to a server); opening it restores the view.
- **VN-WEB-003** (T, M8) Installable PWA that works offline after the first visit for the planets and every spacecraft the user has viewed; a service worker caches the app and ephemeris chunks by content hash.
- **VN-WEB-004** (T, M8) Custom domain with HTTPS (OI-2), and a redirect from the GitHub Pages address.
- **VN-WEB-005** (T, M8) Social preview: Open Graph and Twitter card metadata with a static preview image per preset view.

### 4.14 Documentation and attribution (DOC)

- **VN-DOC-001** (I, M0) README: what Vastness is, how to run it, how data is made, licence.
- **VN-DOC-002** (I, M1) docs/DATA_SOURCES.md: every data set and asset with source, licence or terms, retrieval date and how it is used; NASA/JPL Horizons credited as JPL asks.
- **VN-DOC-003** (I, M1) docs/EPHEMERIS_FORMAT.md: the binary layout, the manifest schema and the fitting method.
- **VN-DOC-004** (I, M8) A short user guide reachable from the Help menu.
- **VN-DOC-005** (T, M0) Every session ends by publishing the `nightly` release of main (static app zip, `build.json`, `SHA256SUMS`, the ephemeris accuracy summary once it exists) and checking it against HEAD (scripts/nightly.sh).

### 4.15 Expansion (EXT)

- **VN-EXT-001** (T, M9) Space weather: coronal mass ejections (CME analyses: start time at 21.5 solar radii, direction, half-angle, speed, type), flares (class, source location), geomagnetic storms (Kp) and WSA-Enlil arrival predictions from NASA DONKI over its whole archive (2010 on), fetched by the build pipeline with the project's API key (never in the client), shown as an optional layer with dates.
- **VN-EXT-002** (T, M9) Close approaches: near-Earth objects passing within 0.05 AU in the next 60 days, from the CNEOS close-approach API, fetched at build time, with SBDB orbits for drawing.
- **VN-EXT-003** (T, M9) More spacecraft by catalog entry alone (no code change), including missions that ended (Cassini, Galileo, Rosetta, Pioneer 10 and 11) where Horizons has them.
- **VN-EXT-005** (T, M9) CMEs drawn as storms: an expanding cone or shell from the Sun along the DONKI direction, at its half-angle and speed, from its start time; density or brightness from its mass where known (VN-EXT-006), colour from speed class or kinetic energy; flares marked at their source on the Sun; predicted arrivals at Earth and spacecraft marked, with the storm's Kp where known; the info panel gives each value and its source, and says when mass is unknown.
- **VN-EXT-006** (T, M9) CME mass and kinetic energy from the CDAW SOHO/LASCO CME catalog (NASA GSFC), matched to DONKI events by time and position angle, fetched at build time; values the catalog flags as poor are marked as such.
- **VN-EXT-007** (T, M9) Measured near-Earth solar wind from NOAA SWPC (plasma density, speed, interplanetary magnetic field Bz, Kp), fetched at build time for the span SWPC serves, shown at Earth's L1 point with dates.
- **VN-EXT-004** (T, M9) Light-time animation of a command to and the reply from a selected spacecraft, at true speed or scaled.

## 5. Reference objects

| Object | Exercises |
|---|---|
| Earth, Moon | the Earth-Moon pair at true scale; geocentric storage of the Moon; the Earth-Moon preset |
| Mercury | fast orbit; short segments; near the Sun |
| Jupiter, Juno | a spacecraft in a 53-day orbit around a planet; perijove segments |
| Voyager 1 | the farthest object; float64 precision at 170 AU; light-time near a day |
| Parker Solar Probe | perihelia under 0.05 AU at about 190 km/s; segment subdivision |
| Europa Clipper | gravity assists (Mars 2025, Earth 2026); flyby segments |
| LRO | a low lunar orbiter (about 2 h period, 50-100 km altitude); element segments; the 2 km tolerance; full mission or window by measurement |

## 6. Assumptions and later

- Horizons stays free, keyless and reachable from CI; if it is down, the last committed ephemerides keep the app working.
- One user per tab; no collaboration.
- Later, when the user asks: a VR or AR view; a story mode with narration; spacecraft attitude and instrument fields of view (SPICE); comets with tails; translations.

## 7. Open items

- **OI-1** Licence: MIT (the user's other projects) or Apache-2.0 (as the design document allows)? Default MIT. **Answered 2026-11-26 (W-002):** Apache-2.0. The user wants open source that keeps the credit and stops a one-line change being passed off as original; Apache-2.0 requires the copyright and NOTICE to be kept and changed files to be marked, and grants no trademark. No open source licence forbids reuse; a copyleft licence (GPL/AGPL) would additionally force derivatives to publish their source, which the user may still choose.
- **OI-2** Domain: which of vastness.space, thevastness.space, solarvastness.space is available and bought? Until then the GitHub Pages address.
- **OI-3** Hosting: GitHub Pages (the default: same place as the code and CI; chosen over GitLab on 2026-11-26) or Cloudflare Pages or Vercel (the design document's suggestions)? The repository is private at seed; public makes Actions minutes free and Pages available on the free plan, and the design calls for open source. **Answered 2026-11-26 (W-003):** GitHub Pages. Making the repository public (or a paid plan) stays a user action before T-007.
- **OI-4** The spacecraft list for 1.0: the twelve in VN-CAT-002, or more or fewer? **Answered 2026-11-26 (W-004):** at least VN-CAT-002, plus some operational Starlink, geostationary and other satellites: JWST joins VN-CAT-002; Earth satellites are VN-CAT-007 and VN-DAT-009 (ADR-0007, T-091..T-094). The agent picks the exact satellites in T-093; the user may change them through WORKINGLIST.
- **OI-5** Planet coverage: 1900-2100 (default) or wider (Horizons offers far more; files grow linearly)? **Answered 2026-11-26 (W-005):** the user was unsure what it asks; it is how many years of planet positions are stored. The default 1900-2100 stands; outside it (rev D) planets are not drawn; before rev D they used the approximate model, marked approximate. It can be widened later at the cost of larger files.
- **OI-6** Lunar orbiters: element segments decide by measurement (VN-EPH-011): the whole mission if it fits 5 MB per object at 2 km, else ±30 days around the build with an illustrative orbit outside. **Decided 2026-11-26 (seeding chat)**; open only for the budget and window sizes.
- **OI-7** Live data: is build-time data refreshed by CI (daily for predictions) enough, or should the app fetch fresh Horizons data through a serverless proxy? **Answered 2026-11-26 (W-006):** build-time data refreshed by CI is enough for now; a manual refresh is wanted later: the refresh workflow also runs on `workflow_dispatch` (T-047). An in-app refresh would need the proxy and a new ADR.
- **OI-8** Textures: which sources are acceptable (NASA public domain only, or CC BY sets such as Solar System Scope with attribution)? **Answered 2026-11-26 (W-007):** NASA public domain and CC BY sets (such as Solar System Scope) are acceptable, with attribution wherever required.
- **OI-9** The reference machine for VN-PRF-001: CPU, GPU, browser, display. **Answered 2026-11-26 (W-008):** AMD Ryzen 7 7800X3D, NVIDIA RTX 4070 Super, Chrome, an ultrawide panel at its typical resolution (3440x1440, confirmed). Details in docs/TESTBED.md.
- **OI-10** Milestone order: is docs/ROADMAP.md's order right (data first, then the scene, spacecraft, time, scale, polish, accessibility and performance, release, expansion)? **Answered 2026-11-26 (W-009):** the roadmap order is confirmed.
