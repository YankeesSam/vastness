schema: 1
project: vastness
milestone: M1
phase: 1
status: running
active_task_id: T-011
active_task: "P0 @phase1 slice: time scales: UTC <-> TAI with the IERS Bulletin C leap-second table, TT, TDB (periodic term), Julian dates, ISO parse and format; reference values from the Astronomical Almanac and IERS (VN-EPH-001)"
next_skill: vastness-execute
session: 5
updated: 2026-11-26T19:00:00-05:00
branch: main
last_commit: 8722712
push: ok
git_owner: YankeesSam
git_repo: vastness
toolchain: "node 22 + npm 10 (floor node 20); Playwright Chromium (SwiftShader WebGL) for e2e"
fixture: "F1 testdata/horizons (T-015); F2 testdata/reference (T-019); F3 public/ephem (T-020); F4 headless Chromium WebGL (T-005); F5 reference views (T-034)"
blockers: []
context_files_max: 8
