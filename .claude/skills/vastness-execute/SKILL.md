---
name: vastness-execute
description: TDD execution of the single active Vastness PLAN task. Use when start selects work, or the user says execute, implement, code, TDD, or build the current slice. Validates with vitest, tsc and prettier (and Playwright for app and scene flows, ephem:check for data).
metadata:
  type: workflow
  version: "1.0"
  project: vastness
---

# Execute

Do exactly STATE.active_task_id. No extra features.

## Context

Read agent/CONTEXT.md paths only. If a symbol is missing, add one file to CONTEXT. Keep at most 8 files.

grep the task's `req:` IDs in docs/REQUIREMENTS.md for the exact wording. Name each verified ID in the test: `it("VN-EPH-001: UTC to TT across the 2016-12-31 leap second", ...)`, or a `// VN-EPH-003` comment beside the assertion.

## Domain skills

Load the one matching the task's `files:` before writing code (AGENTS.md has the table):

| Files | Skill |
|---|---|
| src/core/time, src/core/ephem, src/core/frames.ts, src/core/constants.ts, tools/, data/, testdata/, public/ephem | vastness-ephemeris |
| src/scene, src/core/camera, src/core/scale, src/core/labels, src/core/trails, src/core/orbits | vastness-scene |

Other areas (store, panels, settings, CI, docs) need no domain skill.

## TDD loop (mandatory)

1. Write or extend the failing test named in the PLAN test field.
2. Run it (`npx vitest run path/to/x.test.ts -t "name"`; `npx playwright test e2e/x.spec.ts` for e2e). Confirm red.
3. Write the minimum production code to pass.
4. Re-run the focused test, then the full checks:
   - `npm run typecheck`
   - `npm test`
   - `npx prettier --check .`
   - `npm run e2e` when the task touches src/app or src/scene and an e2e spec covers it
   - `npm run ephem:check` when the task touches tools/ephem, data/ or public/ephem (once T-019 exists)

   A PostToolUse hook already runs prettier on each .ts/.tsx/.css/.json file you write or edit.
5. Refactor only while tests stay green.

## Testbed rules

- Unit tests build their own inputs or use F1/F2; no network (a setup file makes `fetch` throw).
- Reference values come from Horizons (F2) or a cited almanac, never from our own code's output.
- Tolerances are never loosened to make a test pass. A changed tolerance needs a requirement change through the inbox.
- Screenshot baselines are updated only with `--update-snapshots` and a line in HANDOFF.notes saying why.
- Never `sudo`. If a step needs it, stop blocked with the exact command for the user.

## Architecture guards (fail the task if violated)

- **Core purity:** src/core imports nothing from react, three, the DOM or `node:*`; no `window`, `document`, `process` (guard test). tools/ may use Node; src/ may not import tools/.
- **No network at run time:** nothing in src calls fetch, XMLHttpRequest, WebSocket, EventSource or sendBeacon except the asset loader for own-origin files and the service worker (ADR-0002, ADR-0005).
- **No dynamic code:** no eval, new Function, string timers.
- **Float64 positions:** world positions stay float64 on the CPU; only camera-relative values go to the GPU (ADR-0004).
- **One time scale inside:** TDB seconds since J2000 everywhere in core; UTC only at the UI edge (ADR-0003).
- **Deterministic output:** sorted keys where order is free, LF, no timestamps, seeded randomness only.
- **Dependencies:** runtime dependencies only as ADR-0001 names (check-deps); new dev dependencies only when the task says so.
- **Attribution:** every data file and asset added is listed in docs/DATA_SOURCES.md in the same task (ADR-0006).

## Stop conditions

Tests for this slice green, or blocked with a new D-* and STATE.status blocked, or about to touch a second T-* task.

Then run vastness-handoff.
