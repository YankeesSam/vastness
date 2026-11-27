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
commit: 690daba
push: ok
notes:
  - Session 18 batch at the user's request: M7 performance and mobile (T-072, T-073, T-075, T-070, T-074). M7 now has only T-076 (Firefox/WebKit) left. T-097 still stashed (`git stash list`: "T-097 WIP").
  - Quality: auto is high on a desktop with 4+ cores, 8 GB and an 8k texture limit, so this machine and the 4-core CI runner both render high and no visual baseline changed. The budget spec asserts the tier is high; if CI ever reports another tier, that is why baselines moved.
  - Budgets (docs/TESTBED.md): 64 draw calls, 100k triangles, 64 MB textures, from 32 / 28,290 / 20 KB. T-062 textures must fit 64 MB at the high tier (4k maps with mipmaps are ~85 MB each uncompressed, so use 2k or fewer).
  - VN-PRF-001 shown by the user (W-010): 100 fps, p95 10.2 ms at 3440x1277, high tier; recorded in docs/TESTBED.md (Chrome version not given).
  - Inbox W-010..W-013: new VN-SCN-009 (orientation and spin) and VN-SCN-010 (eclipse shadows); Next after T-097 and T-047: T-098 rotation, T-062 textures and topography, T-099 shadows (absorbs D-003), T-096 models. D-004 opened from the user screenshot (JWST whole-coverage trail aliases into chords).
  - T-074: Controls already did one-finger orbit, pinch and two-finger pan, and the picker already ignores a pinch; no scene change was needed. Under 768 px the panel is an opaque bottom sheet, closed at first; the "Scale" word is hidden (the select keeps its name).
  - Fallback: WebGL 2 probed once (src/app/device.ts); without it Shell renders src/app/fallback instead of the canvas and the scale overlay.
  - No visual baselines changed.
  - nightly 0f3ed31-nightly ok; LAN http://192.168.1.166:8770/ (200)
