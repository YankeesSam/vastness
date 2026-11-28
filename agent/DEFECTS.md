# DEFECTS

Open then closed. Do not delete rows.

## Open

- [ ] D-001 sev:low type:env task:unplanned src:test  npm audit: vitest 3.2.7 (matched to Escapement per ADR-0001) pulls tinypool <=2.1.1 with two critical advisories (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr); dev-only, nothing ships; fix is vitest 5 (breaking), best done with Escapement
- [ ] D-005 sev:low type:test task:unplanned src:session-19  e2e camera.spec VN-CAM-006 (reduced-motion cut to Mars) takes ~1.70-1.75 s locally against its 1.5 s bound; reproduces at the session-start commit d0f5a97 (worktree build) and with textures off, on a quiet machine, while the same spec passed at 918 ms at session start, so it is not this batch's code; suspect the default "now" start time or the environment. User (session 19): within 250 ms of the bound, revisit later; not a requirement change

- [ ] D-006 sev:low type:data task:unplanned src:T-086  NASA DONKI's flare list (api.nasa.gov/DONKI/FLR) answers HTTP 404 for every range (2026-11-27; the CCMC host kauai.ccmc.gsfc.nasa.gov timed out), so flares come only from CME links, with time and source but no GOES class or peak; tools/donki/build.ts probes FLR each run and the file's flareNote says so; when it answers, parse FLR (classType, peakTime, endTime)
- [ ] D-007 sev:med type:data task:T-113 src:T-085  Cassini relative to Saturn (data/orbiters.json, session 21): the orbiter fit holds 50 km at its own samples but F2 finds 150.9 km at JD 2458011.937928 (2017-09-15 10:30 TDB, the last orbit before the plunge), outside both listed misses (414.7 km 1999-07, the Earth flyby while still Saturn-relative; 1312 km over the last 17 min before entry); so Cassini is out of data/orbiters.json and has no ephemeris (its catalog entry stays, the app says it has none). Galileo passes ephem:check but lists 5 misses up to 299 km (1992-1994 cruise flybys of Earth, Gaspra, Ida while fitted Jupiter-relative): the orbiter pipeline's 1 min ladder does not hold heliocentric flybys far from the parent; fit the cruise heliocentric (spacecraft.ts) and only the bound part relative to the parent

## Closed

- [x] D-003 sev:low type:ui task:T-099 src:T-063  Saturn's shadow on its rings (and the rings' shadow on Saturn) is not drawn; at the 2017 solstice view the night-side ring arc is as bright as the lit one  fixed s19 by T-099: analytic Saturn shadow on the rings (Rings.tsx) and ring shadow on Saturn; saturn.png baseline updated
- [x] D-002 sev:low type:ui task:unplanned src:T-055  exaggerated scale: spacecraft and satellite markers are pushed out of enlarged bodies (mapSmall), but their trails stay at true positions, so near a body a trail and its marker part (e.g. LRO around the Moon); trails would need the same mapping per vertex  fixed s19: trail vertices mapped by mapTrail against the bodies at each vertex time (bodies near enough by heliocentric reach only); e2e data-trail-gap < 1 km
- [x] D-004 sev:med type:ui task:unplanned src:user-screenshot(session 18)  trails on "Whole coverage" alias into straight chords across the orbit: the JWST trail (2029-04-17, 1 month/s) shows triangles and pentagons spanning 1 AU; the midpoint-deviation test stops refining when a base interval is near a multiple of the period (midpoint lands on the chord); needs a check at more than the midpoint, or base intervals shorter than a fraction of the shortest period  fixed s19: worst-first refinement over the whole range, bend tested at quarter points and midpoint; an incomplete resample no longer replaces a complete drawn trail

