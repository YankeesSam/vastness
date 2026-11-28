schema: 1
from_session: 21
to_session: 22
completed: [T-085, T-107, T-084]
failed: []
next_task_id: T-097
next_task: "T-097 LRO whole mission under 5 MB: let a yearly part mix element and position files (format v3 landed, 5.66 MB measured)"
next_skill: vastness-execute
read_next:
  - agent/STATE.md
  - agent/PLAN.md
  - tools/ephem/orbiters.ts
  - src/core/ephem/format.ts
  - src/core/ephem/elements.ts
  - docs/EPHEMERIS_FORMAT.md
do_not_read:
  - docs/REQUIREMENTS.md (grep VN-* IDs instead)
  - docs/architecture/VASTNESS_ARCHITECTURE.md
  - public/ephem, public/spaceweather, public/sun, public/stars.bin, public/textures, testdata, .cache, dist
tests: pass (vitest 567; e2e chromium 74/74; ephem:check 40/40; typecheck, prettier, check-deps, check-size 410 KB clean)
commit: 6335194
push: ok
notes:
  - Session 21 batch at the user's request, the Horizons pipeline: T-097 part (format v3 non-singular elements, the stash applied and dropped), T-085 ended missions, T-107 comets with tails, T-084 dwarf planets (moons split to T-112). T-097 stays NOW.
  - LRO: non-singular elements nearly hold 2010-2011 (5 and 14 misses, max 11.8 km) but lose to positions on the misses rule; 2026 seams still need positions (1.8 MB). Mixing kinds within a part would bring the whole mission to about 3.9 MB.
  - Cassini held out of data/orbiters.json (D-007, T-113): F2 151 km at 2017-09-15 10:30 TDB outside its listed misses. Galileo passes but lists 5 cruise misses up to 299 km.
  - Fixes on the way: spacecraft.ts fits a sub-step piece after a seam on a window's last sample (Rosetta 2010); check-ids caught the dwarf SPK IDs (20000001, not 2000001); Pluto needs 6 h samples (12 h gave 18 km between samples near segment ends).
  - New layers off by default: comets (fragment k), dwarfs (f); no baseline changed. Comets and dwarfs load after the first frame with the spacecraft (SMALL_BODY_MIN_ID).
  - Per-body initial_intervals (512) in data/bodies.json: slow small bodies are about 85-100 KB per 200 years; public/ephem now 22 MB.
  - e2e budget low tier once drew 34 calls against 32 for high (passed in the full run); watch it.
  - nightly 6335194-nightly ok; LAN http://192.168.1.166:8770/ (200)
