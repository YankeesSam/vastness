schema: 1
project: vastness
milestone: M3
phase: 3
status: ready
active_task_id: T-093
active_task: "P1 @phase3 slice: tools/gp fetch and data/satellites: ISS, Hubble, Tiangong, a few operational Starlink, GOES-East, GOES-West and other geostationary satellites (the agent picks; user can change via WORKINGLIST); provenance with epoch; ISS checked against Horizons (-125544) for one day  req: VN-DAT-009, VN-CAT-007  files: tools/gp/, data/satellites.json, data/catalog.json  test: tools/gp/gp.test.ts"
next_skill: vastness-execute
session: 12
updated: 2026-11-27T00:11:30-05:00
branch: main
last_commit: 06203ac
push: pending
git_owner: YankeesSam
git_repo: vastness
toolchain: "node 22 + npm 10 (floor node 20); Playwright Chromium (SwiftShader WebGL) for e2e"
fixture: "F1 testdata/horizons (T-015, lookups T-037); F2 testdata/reference (T-019, spacecraft T-038); F3 public/ephem (T-020, spacecraft T-038); F4 headless Chromium WebGL (T-005); F5 reference views (T-034)"
blockers: []
context_files_max: 8
