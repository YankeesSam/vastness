schema: 1
from_session: 9
to_session: 10
completed: [T-029, T-028, T-032, T-033, T-034, T-095]
failed: []
next_task_id: T-036
next_task: "P0 @phase3 slice: catalog schema and data/catalog.json: the VN-CAT-002 spacecraft (now including JWST) and the bodies, summaries in our own words, sources, status with as-of date  req: VN-CAT-001, VN-CAT-002"
next_skill: vastness-execute
read_next:
  - agent/STATE.md
  - agent/PLAN.md
  - src/core/constants.ts
  - src/scene/colours.ts
  - src/core/labels/declutter.ts
  - src/app/info/InfoPanel.tsx
  - data/
do_not_read:
  - docs/REQUIREMENTS.md (grep VN-* IDs instead)
  - docs/ROADMAP.md (only the current milestone section)
  - docs/architecture/VASTNESS_ARCHITECTURE.md
  - node_modules/, dist/, nightly/, public/ephem/ (read manifest.json keys only), .cache/, testdata/, test-results/, e2e/*-snapshots/, THIRD_PARTY_NOTICES.txt
tests: pass (vitest 252/252; e2e 15/15; typecheck, prettier, check-deps, check-size 338 kB clean)
commit: 1bf0d45
push: ok
notes:
  - Batch session (user asked for 4-6 tasks in one area): the rest of M2 (scene). T-029 labels, T-028 orbits (+ follow-up), T-032 picking, T-033 info panel, T-034 reference views; one commit each. M2 exit criteria all met; milestone now M3.
  - Screen layout: Markers (scene/labels) projects every body each frame into ScreenFrame (x, y, ok, radiusPx, label sizes); labels and picking read it. Labels are DOM spans measured once. Canvas attrs added: data-labels (names shown), data-orbits (orbits with every sample).
  - Orbits (T-095, user): Horizons data only, no approximations (REQUIREMENTS rev D; kepler-approx removed). Before the first complete frame paths use peek (no loads); after it they load their chunks (~2 MB more for the outer planets). A period that would run past 1900-2100 slides inside it (Neptune in 2026: 1935-2100). Outside the coverage a planet is not drawn; the UI reason is still to do (VN-EPH-006).
  - User wants moons (T-084 widened, consider pulling forward after M3) and topographic maps over the bodies (T-062 widened).
  - Snapshot baselines CREATED with --update-snapshots (new F5): e2e/scale.spec.ts-snapshots (earth-moon, inner, outer, 150au, jitter), maxDiffPixelRatio 0.002. They were made locally (WSL, SwiftShader); if CI renders differently, regenerate them from a CI artifact, do not loosen.
  - Jitter: identical still loads give identical frames; a 1 m move changes 2 px by 1 level; the check allows 10 px.
  - Playwright: perf.spec and camera.spec run in project "timed" after the rest, 1 worker. With 10+ specs in parallel SwiftShader contention pushed first render to >3 s and fly-to past 4.5 s; alone they are 2.0 s and 3.8 s.
  - Selection only highlights and raises label priority; it does not fly (object list still selects and flies). Unit pref covers distances (km, AU, mi); UTC/local time pref is still to do with the time bar (M4).
  - D-001 (low, env) unchanged. CI 45922245862 green (screenshot baselines hold on CI). Nightly 0c41d82-nightly ok; LAN http://192.168.1.166:8770/ (200).
open_defects_blocking: []
optimizations_applied: []
