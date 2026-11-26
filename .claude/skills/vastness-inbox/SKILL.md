---
name: vastness-inbox
description: Ingest agent/WORKINGLIST.md user notes into PLAN and DEFECTS for Vastness. Use when the user says inbox, workinglist, log a defect, or add a feature idea, and at the start of every autonomous session.
metadata:
  type: workflow
  version: "1.0"
  project: vastness
---

# Inbox

WORKINGLIST.md is the only file the human is expected to edit mid-stream.

## Format users may write

    - [ ] kind:defect Voyager 1 jumps when time runs at 1 year/s
    - [ ] kind:feature show Mars's moons
    - [ ] kind:note OI-1: MIT

If kind is omitted, infer defect vs feature from words (bug, broken, wrong, fails, crash, jitter mean defect).

## Process each unchecked W-* or raw bullet under `## Inbox`

1. Assign W-### if missing (next = max + 1).
2. A defect becomes a new D-### in DEFECTS.md (src:inbox(W-###)). If a position, distance, light-time or speed disagrees with Horizons, it is `type:acc` and sev high at least. If it blocks the current milestone, also add a PLAN task `slice: fix D-###`.
3. A feature becomes PLAN Later (or Next if P0 and in the current milestone). Name the requirement it serves (`req: VN-...`) or add a new requirement to docs/REQUIREMENTS.md in the same session (next free number in its area; new revision row if the baseline changes).
4. A note becomes PLAN Later as P2, or is dropped if already covered. An answer to an open item (OI-*) updates REQUIREMENTS section 7 (answered, with date) and the requirements and tasks it shapes. Still mark the W processed.
5. Check the W line as `- [x] W-006 → D-010` or `→ T-090`.

Do not rewrite user wording except to add IDs.

## Empty inbox

No file changes except STATE.updated if you touched nothing else.

## Standalone user add

If the user pasted items in chat, append them to WORKINGLIST.md first, then process.
