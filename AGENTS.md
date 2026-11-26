# Vastness agent entry

Say **start**. Do not paste the architecture or the requirements.

## Where things live

| What | Path |
|---|---|
| Skills | `.claude/skills/` |
| Hooks (prettier after each .ts/.tsx/.css/.json edit) | `.claude/hooks/` |
| Control plane | `agent/` |
| Requirements (grep `VN-` IDs, never load whole) | `docs/REQUIREMENTS.md` |
| Roadmap and exit criteria | `docs/ROADMAP.md` |
| Architecture | `docs/architecture/VASTNESS_ARCHITECTURE.md` |
| Stack, ephemeris, time, rendering, hosting and licensing ADRs | `docs/adr/` |
| Testbed (F1..F5, budgets, LAN) | `docs/TESTBED.md` |
| Data sources and terms | `docs/DATA_SOURCES.md` |
| Human inbox | `agent/WORKINGLIST.md` |
| Original design document (input, not a spec) | `docs/design/Vastness_Project_Design_Document.md` |

| Say | Skill file |
|---|---|
| start | `.claude/skills/vastness-start/SKILL.md` |
| plan | `.claude/skills/vastness-plan/SKILL.md` |
| inbox | `.claude/skills/vastness-inbox/SKILL.md` |
| optimize | `.claude/skills/vastness-optimize/SKILL.md` |
| execute | `.claude/skills/vastness-execute/SKILL.md` |
| handoff | `.claude/skills/vastness-handoff/SKILL.md` |
| catalog | `.claude/skills/vastness/SKILL.md` |

Domain skills, loaded by execute when the active task touches their area:

| Area (task `files:`) | Skill file |
|---|---|
| `src/core/time/`, `src/core/ephem/`, `src/core/frames.ts`, `src/core/constants.ts`, `tools/`, `data/`, `testdata/`, `public/ephem/` | `.claude/skills/vastness-ephemeris/SKILL.md` |
| `src/scene/`, `src/core/camera/`, `src/core/scale/`, `src/core/labels/`, `src/core/trails/`, `src/core/orbits/` | `.claude/skills/vastness-scene/SKILL.md` |

GitHub: `YankeesSam/vastness` branch `main`.
Horizons is called only by the pipeline (tools/), serially and cached; never from tests or the app (ADR-0002).
