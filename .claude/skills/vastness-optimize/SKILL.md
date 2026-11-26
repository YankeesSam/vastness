---
name: vastness-optimize
description: Find and wire local tools and MCPs that cut tokens or raise validation quality for Vastness. Use when the user says optimize, tools, token efficiency, or when start sees a stale optimization ledger.
metadata:
  type: workflow
  version: "1.0"
  project: vastness
---

# Optimize

Goal: smaller context, better closed-loop checks. Not new product features.

## 1. Inventory

- `node --version`, `npm --version`, `node_modules/.bin/{vitest,tsc,prettier,playwright}`
- Playwright browsers (`npx playwright --version`, `ls ~/.cache/ms-playwright`)
- `git` and the push path (HTTPS with the repo-local credential helper, docs/TESTBED.md)
- `gh auth status` (runs, releases, Pages)
- connected MCP servers the session lists (Playwright browser tools are useful to look at the running app and its WebGL view)

Read agent/OPTIMIZATIONS.md.

## 2. Wanted tools

| ID | Tool | Why | How |
|---|---|---|---|
| O-001 | Node 22, npm | build, test, pipeline | present (nvm) |
| O-002 | gh | CI runs, nightly, Pages | present |
| O-007 | Playwright Chromium | e2e, screenshots | `npx playwright install chromium` (no sudo; `--with-deps` needs sudo: ask the user) |
| O-012 | context7 MCP | current three.js / R3F API docs | the user installs it if they want it |

Never add runtime dependencies to the product (ADR-0001). Dev-only tools stay in devDependencies.

## 3. Token optimizations to apply when useful

- Read PLAN Now only, not Done.
- Keep CONTEXT.md to 8 files.
- grep `VN-` IDs; never load REQUIREMENTS whole.
- Never read raw Horizons responses, public/ephem binaries, the star catalog or screenshots' pixel data into context. Run `npm run ephem:check` (an error table) or the focused test and read the summary.
- Never judge a rendering by description: open the reference view (F5 URL params) in Playwright and take one screenshot, or run the visual spec.
- `npx vitest run file -t name` for the focused loop, the full run once at the end, `--reporter=dot` for full runs; paste only failures into reasoning.
- Live Horizons calls only through the cached client; a warm cache costs nothing.

Record each applied item as O-### checked in OPTIMIZATIONS.md with gain:.

## 4. Exit

Update OPTIMIZATIONS.md and STATE.updated. If standalone, stop. If called from start, return to start step 5.
