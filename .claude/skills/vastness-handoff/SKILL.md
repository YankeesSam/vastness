---
name: vastness-handoff
description: Close a Vastness session. Use when a task finishes or fails, or the user says handoff, commit, push, wrap up, or done. Updates PLAN and defects, writes STATE and HANDOFF, commits, pushes, publishes and checks the nightly pre-release, and serves the web app on the LAN.
metadata:
  type: workflow
  version: "1.0"
  project: vastness
---

# Handoff

Always run at session end. Keep HANDOFF.md under about 40 lines.

## 1. Facts

- Tests for the active task (pass, fail, none), with counts from `npm test` (and `npm run e2e`, `npm run ephem:check` when they ran)
- typecheck and prettier clean?
- Files changed
- New defects found (accuracy failures are `type:acc`)
- Commit possible?

## 2. Write control files

PLAN. Check the finished T-* or leave it unchecked if not done. Move checked tasks to Done with a one-line result (session, what landed, test counts). Mark the next task NOW.

DEFECTS. Close fixed D-* with fix:T-xxx sha:. Add new D-* for leftovers.

STATE
- status ready if a next task exists, else done or blocked
- active_task_id / active_task to the next task
- next_skill vastness-execute or vastness-plan
- last_commit, push, updated

HANDOFF. Fill the schema from vastness/references/schema.md. read_next is the only context the next session should open (max 8). Keep the requirements and architecture docs in do_not_read unless the next task changes them, and list public/ephem, testdata, .cache and generated output there too.

CONTEXT.md. Replace with HANDOFF.read_next.

Validate: `bash .claude/skills/vastness/scripts/validate-agent.sh .`

## 3. Commit

    bash .claude/skills/vastness-handoff/scripts/commit.sh "T-xxx: slice title"

Message format `T-013: Chebyshev fit and evaluation (VN-EPH-002, VN-EPH-005)`. Handoff-only commits: `handoff: session N T-xxx; next T-yyy`. End each message with the attribution lines the session's system reminder gives, if any.

Never commit build outputs (`dist/`, `nightly/`), `node_modules/`, `.cache/`, Playwright reports or test results. `public/ephem/` is committed only when `npm run ephem` wrote it and `ephem:check` passed.

## 4. Push

`git push origin main`. If it fails, set push failed, add one HANDOFF note pointing at docs/TESTBED.md "Agent access", and continue.

## 5. Smoke

Once T-004 has landed: `npm run build` and report the version line of `dist/build.json`.

## 6. Nightly (every session once T-008 has landed, VN-DOC-005)

Run this last, after every commit and push of the session, so the nightly is the final HEAD: `bash scripts/nightly.sh` (several minutes; use a timeout of 20 minutes or more). The push already started the Nightly workflow; the script waits for that run (or starts one), then checks the published `nightly` pre-release: tag at HEAD, pre-release, SHA256SUMS, build.json naming HEAD.

If it exits non-zero, do not retry blindly. Open a D-* (`type:env` for workflow, billing or packaging failures, `type:test` when tests failed in CI only) naming the run URL, make fixing it the next task unless it needs the user, put the failure in HANDOFF.failed, then commit and push those control files. Their push starts another run; do not wait for it. A push that failed in step 4 means no nightly: say so. Before T-008: "nightly: not yet (T-008)".

## 7. LAN deploy (every session once T-004 has landed)

After the nightly, run `bash scripts/deploy-web.sh` (docs/TESTBED.md "Web app on the LAN"). It builds the app at HEAD, serves it on every interface at port 8770 and prints the `local:`, `windows:` and `lan:` URLs with the HTTP status each returns. Put the `lan:` URL that answered 200 (or, when none did, the `windows:` one and "LAN needs the one-time Windows step") in the user reply and in HANDOFF.notes. A failed build or server start is a D-* `type:env`; it never blocks the handoff.

## 8. User reply (max 9 lines)

- completed or failed IDs
- commit sha or none
- push status
- smoke line
- nightly result (the version and files, or the failure and run URL)
- web app URL on the LAN (step 7), with its status
- next_task_id and next_task
- exact phrase: Next chat, say start.
