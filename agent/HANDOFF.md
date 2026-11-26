schema: 1
from_session: 6
to_session: 7
completed: [T-015, T-016, T-017, T-018, T-019, T-020]
failed: []
next_task_id: T-021
next_task: "P0 @phase1 slice: runtime ephemeris in core: chunk index, injected loader, lazy chunks, body tree composition (Moon relative to Earth) (VN-EPH-005, VN-EPH-009, VN-EPH-010)"
next_skill: vastness-execute
read_next:
  - agent/STATE.md
  - agent/PLAN.md
  - .claude/skills/vastness-ephemeris/SKILL.md
  - docs/EPHEMERIS_FORMAT.md
  - src/core/ephem/format.ts
  - src/core/ephem/chebyshev.ts
  - src/core/ephem/kepler-approx.ts
  - tools/ephem/check.ts
do_not_read:
  - docs/REQUIREMENTS.md (grep VN-* IDs instead)
  - docs/ROADMAP.md (only the current milestone section)
  - docs/architecture/VASTNESS_ARCHITECTURE.md
  - node_modules/, dist/, nightly/, public/ephem/ (read manifest.json keys only), .cache/, testdata/, THIRD_PARTY_NOTICES.txt
tests: pass (vitest 137/137: + horizons 10, client 10, fit 9, main 7, check 6; ephem:check 9/9 objects pass; build and check-size ok)
commit: 1492275
push: ok
notes:
  - Batch session (user asked for 4-6 tasks in one area): the M1 Horizons pipeline T-015..T-020, one commit each.
  - Live Horizons use this session (pipeline only, serial, cached in .cache/horizons): F1 6, smoke 13, F2 27 + 1 TLIST probe, full run 171 requests.
  - ephem:check finding before anything was committed: Jupiter 46 km off at off-grid epochs while held-out midpoints said 9.6 km (Galilean-moon wobble of the planet centre aliased by daily fitting). Fix: Jupiter step 3 h, Saturn/Uranus/Neptune 6 h, fit subdivides to half the tolerance (FIT_TARGET_FRACTION); misses still judged at the full tolerance.
  - public/ephem: 180 chunks (<id>/<decade>.bin), 13 MB, about 630 KB per decade; worst F2 error 4.853 km (Saturn); 0 misses, 0 barycentre fallbacks; offline rerun byte-identical.
  - A 100-epoch TLIST URL drew HTTP 502; F2 is recorded in TLIST requests of 40. The client retries only 503 and network errors, by design.
  - src/core relative imports now carry .ts so tools/ runs under node --experimental-strip-types; keep that for new core files the pipeline imports.
  - tests/setup-no-network.ts makes the global fetch throw in every vitest project (VN-DAT-007).
  - D-001 (low, env) unchanged. Nightly 837adba-nightly ok; LAN http://192.168.1.166:8770/ (200).
open_defects_blocking: []
optimizations_applied: []
