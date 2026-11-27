schema: 1
from_session: 18
to_session: 19
completed: [T-072, T-073, T-075, T-070, T-074]
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
  - public/ephem, public/stars.bin, testdata, .cache, dist
tests: pass (vitest 481; e2e 59/59; typecheck, prettier, check-deps, check-size clean)
commit: PENDING
push: PENDING
notes:
  - Session 18 batch at the user's request: M7 performance and mobile (T-072, T-073, T-075, T-070, T-074). M7 now has only T-076 (Firefox/WebKit) left. T-097 still stashed (`git stash list`: "T-097 WIP").
  - Quality: auto is high on a desktop with 4+ cores, 8 GB and an 8k texture limit, so this machine and the 4-core CI runner both render high and no visual baseline changed. The budget spec asserts the tier is high; if CI ever reports another tier, that is why baselines moved.
  - Budgets (docs/TESTBED.md): 64 draw calls, 100k triangles, 64 MB textures, from 32 / 28,290 / 20 KB. T-062 textures must fit 64 MB at the high tier (4k maps with mipmaps are ~85 MB each uncompressed, so use 2k or fewer).
  - VN-PRF-001 (D) needs the user: open the app with ?stats on the reference machine at 1920x1080 and 3440x1440 and fill the table in docs/TESTBED.md (Chrome version, fps, p95).
  - T-074: Controls already did one-finger orbit, pinch and two-finger pan, and the picker already ignores a pinch; no scene change was needed. Under 768 px the panel is an opaque bottom sheet, closed at first; the "Scale" word is hidden (the select keeps its name).
  - Fallback: WebGL 2 probed once (src/app/device.ts); without it Shell renders src/app/fallback instead of the canvas and the scale overlay.
  - No visual baselines changed.
