schema: 1
project: vastness
milestone: M1
phase: 1
status: ready
active_task_id: T-015
active_task: "P0 @phase1 slice: Horizons query builder and response parser (JSON envelope, $$SOE/$$EOE CSV vectors, header fields, error texts); record F1 once with tools/ephem/record.ts (the only live fetch in the task) (VN-DAT-001, VN-DAT-004, VN-DAT-007)"
next_skill: vastness-execute
session: 5
updated: 2026-11-26T19:40:00-05:00
branch: main
last_commit: 5555177
push: ok
git_owner: YankeesSam
git_repo: vastness
toolchain: "node 22 + npm 10 (floor node 20); Playwright Chromium (SwiftShader WebGL) for e2e"
fixture: "F1 testdata/horizons (T-015); F2 testdata/reference (T-019); F3 public/ephem (T-020); F4 headless Chromium WebGL (T-005); F5 reference views (T-034)"
blockers: []
context_files_max: 8
