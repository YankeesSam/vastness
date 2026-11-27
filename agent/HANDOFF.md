schema: 1
from_session: 15
to_session: 16
completed: [T-054, T-055, T-056, T-057, T-058]
failed: []
next_task_id: T-097
next_task: "T-097 LRO whole mission under 5 MB (non-singular elements, format v3); WIP in git stash"
next_skill: vastness-execute
read_next:
  - agent/STATE.md
  - agent/PLAN.md
  - src/core/ephem/elements.ts
  - src/core/ephem/format.ts
  - tools/ephem/orbiters.ts
  - docs/EPHEMERIS_FORMAT.md
do_not_read:
  - docs/REQUIREMENTS.md (grep VN-* IDs instead)
  - docs/architecture/VASTNESS_ARCHITECTURE.md
  - public/ephem, testdata, .cache, dist
tests: pass (vitest 430; e2e 35/35; typecheck, prettier, check-deps, check-size clean)
commit: pending
push: pending
notes:
  - Session 15 batch at the user's request: M5 scale tasks T-054..T-058; T-059 (tour engine) and T-060 (needs-user text review) remain in M5. T-097 still stashed (`git stash list`: "T-097 WIP"); session 13 notes hold.
  - Scale: BodyFrame now has truth (true), world (drawn) and radius (drawn); everything drawn/framed uses world/radius, distances use truth. True scale is the default (F5 views unchanged); `?scale=exaggerated` and link field `x=e`.
  - Exaggerated factors (src/core/scale/mapping.ts): Sun 40, rocky planets and Moon 1000, giants 300; Moon ×34 about Earth (clearance 1.5 at perigee 356 000 km). Tightest pair over 400 sampled times: Mercury near the Sun, > 1.2 clear.
  - F5 baselines (all 5) re-taken with --update-snapshots: the new scale bar sits over the view and is masked like the panels; diff checked by eye (only the mask area).
  - New layer `callouts` (fragment letter d): links made before this session open with callouts off.
  - D-002 low: trails stay at true positions in exaggerated scale while markers are pushed out.
  - Flaky under parallel load, pass alone: ephemeris.perf.test.ts allocation test, tests/nightly-build.test.ts.
open_defects_blocking: []
optimizations_applied: []
