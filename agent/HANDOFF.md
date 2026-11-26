schema: 1
from_session: 4
to_session: 5
completed: [T-004, T-005, T-007, T-035]
failed: []
next_task_id: T-011
next_task: "P0 @phase1 slice: time scales: UTC <-> TAI with the IERS Bulletin C leap-second table, TT, TDB (periodic term), Julian dates, ISO parse and format; reference values from the Astronomical Almanac and IERS (VN-EPH-001)"
next_skill: vastness-execute
read_next:
  - agent/STATE.md
  - agent/PLAN.md
  - .claude/skills/vastness-ephemeris/SKILL.md
  - docs/adr/0003-time-frames-units.md
  - tests/guards.test.ts
  - vitest.config.ts
do_not_read:
  - docs/REQUIREMENTS.md (grep VN-* IDs instead)
  - docs/ROADMAP.md (only the current milestone section)
  - docs/architecture/VASTNESS_ARCHITECTURE.md
  - node_modules/, dist/, nightly/, public/ephem/, .cache/, testdata/, THIRD_PARTY_NOTICES.txt
tests: pass (vitest 48/48: smoke 4, guards 11, check-deps 7, docs 4, ci 3, nightly-build 6, pages 4, check-size 3, Shell 6; e2e 3/3: smoke 2, perf 1)
commit: 8722712
push: ok
notes:
  - Batch session (user asked for 4-6 tasks in one area): app shell and web delivery T-004, T-005, T-007, T-035, one commit each. M0 exit criteria met; milestone now M1.
  - T-025 (view store) was not taken into the batch: its TDB clock needs T-011 first.
  - build info: vite.config.ts buildInfo() uses the nightly's git commands; VASTNESS_VERSION overrides the version (nightly-build.sh sets it); dist/build.json is emitted by the build.
  - Vitest sets NODE_ENV=test, which made the nightly-build test produce a React dev bundle (1.5 MB); nightly-build.sh now builds with NODE_ENV=production.
  - Pages: pages.yml runs after a successful CI push run on main (workflow_run) or by dispatch; VASTNESS_BASE=/vastness/; default base stays ./ for the LAN server and the nightly zip. check-pages.sh --wait polls build.json.
  - e2e: canvas gets data-scene-ready="1" after the first frame; perf uses DevTools Fast 4G; first render 1.0 s, initial download 323 kB gz.
  - D-001 (low, env) unchanged.
open_defects_blocking: []
optimizations_applied: [O-007]
