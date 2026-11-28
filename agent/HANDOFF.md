schema: 1
from_session: 20
to_session: 21
completed: [T-086, T-100, T-102, T-101, T-104]
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
  - public/ephem, public/spaceweather, public/sun, public/stars.bin, public/textures, testdata, .cache, dist
tests: pass (vitest 552; e2e chromium 72/72 at 4 workers, D-005 passed this run at 1.6 s; typecheck, prettier, check-deps, check-size 405 KB clean)
commit: 95ef70b
push: ok
notes:
  - Session 20 batch at the user's request, space weather: T-086 DONKI, T-100 CDAW, T-102 SWPC, T-101 storms in the scene, T-104 Helioviewer. T-097 still stashed ("T-097 WIP").
  - Pipeline: npm run donki | cdaw | swpc | sun (in that order; each has --offline; sun has --check). Shared polite client tools/net/polite.ts (secrets kept out of URL cache keys and messages; binary bodies cached as base64). Deterministic JSON tools/net/json.ts (one record per line); public/spaceweather and public/sun are prettier-ignored.
  - DONKI: 60-day range limit, so monthly requests (609 cached). FLR endpoint 404 -> D-006 (flares without class). Analysis rule: most accurate, LE before SH; Enlil: latest run on it. 1458 CMEs lack a longitude etc. and are listed, not drawn.
  - CDAW server reset connections after the first download; the cache holds that response (Date header 2026-11-28T01:17:58Z), byte-exact.
  - SWPC: products/solar-wind/*-7-day.json are gone (404); json/rtsw 1-minute files cover one day only, so the build holds 2026-11-27 01:00..2026-11-28 01:00. The panel says so outside that span.
  - Scene: shells are pooled (24, newest kept); opacity from CDAW mass with r^-0.7 spread, fade over the last 0.5 AU before 2 AU, rim brightening so the camera inside a storm is not washed out. The grey wash near the Sun at a few million km is the existing glow, not the storms.
  - Helioviewer terms: SDO images not copyrighted, credit "Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams"; Helioviewer states no licence (helioviewer.org redirects to a NASA host, not followed). Watermark off.
  - New baseline gannon-storm-2024.png (new test, VN-EXT-005); no existing baseline changed.
  - nightly 95ef70b-nightly ok; LAN http://192.168.1.166:8770/ (200)
  - Refresh (T-047) should also run donki, cdaw, swpc --refresh and sun when it lands; data/spaceweather.json holds the DONKI end date.
