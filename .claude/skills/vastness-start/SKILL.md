---
name: vastness-start
description: Autonomous session bootstrap for Vastness. Use when the user says start, continue, next, go, resume, or run the next task. Chains inbox, plan, execute, and handoff without asking for the next step.
metadata:
  type: workflow
  version: "1.0"
  project: vastness
---

# Start

Run this loop. Do not ask what to do next unless status is blocked and a human decision is required.

## 0. Locate control plane

Find `agent/STATE.md` at the repo root. If it is missing, stop: the repo is not seeded.

## 1. Minimum read (in order)

1. `agent/STATE.md`
2. `agent/HANDOFF.md`
3. Only the Now section of `agent/PLAN.md` (stop at Next)
4. Open defects in `agent/DEFECTS.md` matching `STATE.blockers`, and any open `type:acc` defect

Do not read the architecture or requirements docs. Do not read WORKINGLIST.md yet.

## 2. Environment check

Run `bash scripts/check-env.sh`. If a required item fails (node 20 or newer, npm, git, `node_modules` once T-001 has landed), set status blocked, put the exact fix command in HANDOFF.notes, write STATE, and stop. Playwright browsers matter only to e2e tasks; network access to ssd.jpl.nasa.gov only to tasks that run the pipeline live.

## 3. Inbox

Follow vastness-inbox. If WORKINGLIST has unchecked items, process them before picking work.

## 4. Refresh plan if needed

Follow vastness-plan when any of
- PLAN has no NOW task
- the inbox created new T/D items
- STATE.milestone/phase does not match PLAN Now
- the last handoff `failed` list is non-empty

Otherwise skip the plan skill body.

## 5. Choose work

Priority:
1. open `type:acc` defects (a position or read-out disagrees with Horizons beyond tolerance): everything shown stands on the data;
2. other blocking D-* of sev high/crit on the current milestone;
3. the PLAN NOW task;
4. the first Next P0.

Skip `needs-user:` tasks whose precondition does not hold (say which in HANDOFF.notes).

Write STATE
- status running
- active_task_id / active_task
- session increment
- updated now

Rewrite `agent/CONTEXT.md` to at most 8 paths from HANDOFF.read_next plus files the NOW task names.

## 6. Execute

Load vastness-execute and finish the one active task. Stop after that task. Do not start a second T-* unless it is a short blocker fix required for the test you just wrote.

## 7. Close

Load vastness-handoff even on failure. Partial work still gets state plus a commit of green tests only.

## Blocked

If you cannot proceed without the user, set status blocked, write one question in HANDOFF.notes, then still write STATE.
