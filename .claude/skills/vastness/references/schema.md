# Agent file schemas (v1)

Keep files short. No essays. IDs are stable (`T-###`, `D-###`, `W-###`, `O-###`); requirement IDs are `VN-<AREA>-###` in docs/REQUIREMENTS.md; open items `OI-#`.

## STATE.md

```yaml
schema: 1
project: vastness
milestone: M0          # M0..M9
phase: 0               # 0..9, same number as the milestone
status: ready | running | blocked | done
active_task_id: T-000 | null
active_task: one line or null
next_skill: vastness-start | vastness-execute | vastness-plan | vastness-optimize | vastness-handoff
session: 0
updated: YYYY-MM-DDThh:mm:ss+hh:mm
branch: main
last_commit: none | <sha7>
push: pending | ok | skipped | failed
git_owner: YankeesSam
git_repo: vastness
toolchain: "node 22 + npm 10 (floor node 20); Playwright Chromium for e2e"
fixture: "F1 testdata/horizons; F2 testdata/reference; F3 public/ephem; F4 headless Chromium WebGL; F5 reference views"
blockers: []
context_files_max: 8
```

`blockers` items are `D-###` or short tokens. Empty list if none.

## HANDOFF.md

```yaml
schema: 1
from_session: N
to_session: N+1
completed: [T-001]
failed: []
next_task_id: T-002
next_task: one line
next_skill: vastness-execute
read_next:
  - agent/STATE.md
  - agent/PLAN.md
  - src/core/path/to/module.ts
do_not_read:
  - docs/REQUIREMENTS.md (grep VN-* IDs instead)
tests: pass | fail | none (with counts: vitest, e2e, c)
commit: none | <sha7>
push: ok | skipped | failed
notes:
  - fact only, max 8
open_defects_blocking: []
optimizations_applied: []
```

`read_next` max 8 paths. `do_not_read` lists large docs and trees the next session must not ingest.

## PLAN.md

Sections in order: `Now`, `Next`, `Later`, `Done`.

Each task line:

`- [ ] T-026 P0 @phase2 slice: floating origin  req: VN-SCN-004  files: src/scene/origin.ts  test: src/scene/origin.test.ts`

Rules:
- Exactly one unchecked task may be `NOW` (the active one), written `- [ ] NOW T-...`.
- A task marked `needs-user:` is skipped (not blocked) until its precondition holds.
- Checkboxes only change in plan / execute / handoff.
- Do not duplicate requirement, language or semantics text. Cite IDs and files.

## DEFECTS.md

`- [ ] D-001 sev:low|med|high|crit type:bug|gap|env|test|acc task:T-003|unplanned src:inbox(W-001)|test|review|accuracy  title`

`type:acc` is an accuracy failure: an ephemeris, read-out or drawn position disagrees with Horizons (F2) beyond its tolerance. Always sev:high or crit.

When fixed: `- [x] D-001 … fix:T-00N sha:abc1234`

## WORKINGLIST.md

User inbox. Agents must not write feature prose here except to mark processed lines.

`- [ ] W-001 kind:feature|defect|note text`

After the inbox skill runs, the line becomes `- [x] W-001 → T-00N` or `→ D-00N`.

## OPTIMIZATIONS.md

`- [x] O-001 tool:node status:installed gain:build-and-test`

`- [ ] O-005 tool:playwright-browsers status:to-install gain:e2e`

## CONTEXT.md

Bullet list of the only extra files this session may read (max 8). Rewritten each execute.
