---
name: vastness-plan
description: Maintain the token-cheap Vastness PLAN and roadmap. Use when the user says plan or roadmap, after the inbox creates items, when a task is finished and must be checked off, or when start finds no NOW task.
metadata:
  type: workflow
  version: "1.0"
  project: vastness
---

# Plan

PLAN.md is the live task queue; docs/ROADMAP.md holds milestone goals and exit criteria. Scratch items off in PLAN. Do not rewrite the architecture.

## Sources (read only what you need)

- agent/STATE.md
- agent/PLAN.md
- new T/D ids from the inbox
- agent/DEFECTS.md open items
- the one milestone section of docs/ROADMAP.md when opening a new milestone

## Edit rules

1. Keep four headings: Now, Next, Later, Done. Move checked tasks to Done (do not delete).
2. One NOW marker on a single unchecked task.
3. IDs never reused. Next ID = max existing + 1.
4. Each task line includes P0, P1 or P2, @phaseN, slice:, req: (the VN-* IDs it verifies), files:, test:.
5. One session per task. Split instead of writing mega-tasks: a task that touches both the pipeline (tools/) and the app, or both core and scene, is two tasks.
6. Blocking defects become PLAN tasks `slice: fix D-00N` at the top of Now or Next. `type:acc` defects go first.
7. Do not paste long specs into PLAN. Point at requirement IDs and files.
8. A `needs-user:` task is skipped, not blocked, until its precondition holds; say so in HANDOFF.notes.
9. When a milestone's tasks are all checked, check its exit criteria in docs/ROADMAP.md; when they hold, advance STATE.milestone and phase, and move the next milestone's tasks from Later to Next.
10. User answers to open items (OI-*) arrive through the inbox: update the requirement text, REQUIREMENTS section 7 and the tasks they shape in the same session.
11. Run `bash .claude/skills/vastness/scripts/validate-agent.sh .` after editing: it checks task line fields and that every cited VN-* ID exists.

## Phase order (do not skip)

0 bootstrap (M0), 1 ephemeris and time (M1), 2 scene and camera (M2), 3 spacecraft (M3, completes the MVP), 4 time control and sharing (M4), 5 scale and education (M5), 6 visual polish (M6), 7 accessibility, mobile, performance (M7), 8 release 1.0 (M8), 9 expansion (M9).

The order is the seed's and open to the user (OI-10). The one hard dependency: nothing in M2..M9 that draws or reports a position starts before M1's accuracy check passes. M6 polish may start early on request, but textures need OI-8.

## Output

Update PLAN.md. Set STATE.next_skill to vastness-execute unless planning-only was requested. One-line summary to the user.
