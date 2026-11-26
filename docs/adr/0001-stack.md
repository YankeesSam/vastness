# ADR-0001 Stack

Status: accepted (2026-11-26, seed).

## Context

Vastness is a static web app with a heavy 3D view and a light DOM interface, plus a Node data pipeline. The user's other web projects (Escapement, Breakout) use TypeScript, React, Zustand, Vite, Vitest and Playwright, and the agent workflow, hooks and scripts assume them. The design document recommends React with React Three Fiber or three.js, and Zustand.

## Decision

- **TypeScript, strict**, ES modules, Node 22 for development (floor Node 20 for the pipeline).
- **Runtime dependencies (the allowlist checked by scripts/check-deps.mjs, VN-GEN-005):** `react`, `react-dom`, `three`, `@react-three/fiber`, `zustand`. Anything else needs a task that amends this ADR.
- **Dev dependencies:** `vite` 7, `@vitejs/plugin-react`, `typescript`, `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`, `@axe-core/playwright` (M7), `prettier`, `@types/*`. Versions match Escapement's package.json for shared packages; three and @react-three/fiber at their current stable at T-001, pinned by the lock file.
- **Layout:** `src/core` (pure TypeScript: time, frames, ephemeris evaluation, camera maths, scale, labels, trails, catalog schema, share codec), `src/scene` (R3F components), `src/app` (React interface, store, loader), `tools/` (Node pipeline: Horizons, fitting, stars), `data/` (hand-written inputs: bodies, catalog), `public/ephem/` (generated, committed).
- **Not used:** @react-three/drei (large; the few helpers needed are written in src/scene), a CSS framework (plain CSS modules with custom properties for themes), a router (one view; state in the URL fragment).

## Consequences

- The same tools and hook as the user's other projects; the agent workflow carries over.
- Writing our own camera controls instead of drei's is more code, but fly-to across 12 orders of magnitude needs custom maths anyway (ADR-0004).
