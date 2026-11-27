# Vastness architecture

Short by design. Decisions are in docs/adr; requirements in docs/REQUIREMENTS.md.

## 1. Data flow

```
 build time (Node, tools/)                                   run time (browser, src/)
 ─────────────────────────                                   ────────────────────────
 data/bodies.json ─┐                                         public/ephem/manifest.json
 data/catalog.json ┤                                                 │
                   ▼                                                 ▼
 Horizons API ──► client (serial, cached in .cache/) ──► parser ──► fit (Chebyshev, adaptive)
                                                                     │
                                       ephem:check vs F2 ◄───────────┤
                                                                     ▼
                                                     public/ephem/*.bin + manifest (committed)
                                                                     │  own-origin fetch
                                                                     ▼
                     src/app/assets/loader ──► src/core/ephem (evaluate, compose) ──► view store
                                                                     │
                            src/core (camera, scale, labels, trails, readouts)
                                                                     │
                            src/scene (R3F: floating origin, log depth, RTE lines)
                            src/app   (panels, time bar, search, share, settings)
```

## 2. Source tree

| Path | Holds | May import |
|---|---|---|
| `src/core/time` | UTC/TAI/TT/TDB, leap seconds, clock | core only |
| `src/core/ephem` | Chebyshev, binary format, ephemeris evaluation and composition (no approximate fallback, rev D) | core only |
| `src/core/frames.ts`, `constants.ts` | frame and axis conversion, constants with sources | core only |
| `src/core/camera`, `scale`, `labels`, `trails`, `orbits`, `share`, `catalog`, `readouts.ts`, `quality.ts` | pure maths and data for the interface | core only |
| `src/scene` | R3F components, shaders, picking | core, three, @react-three/fiber, react |
| `src/app` | shell, panels, store (Zustand), loader, settings, tour, service worker registration | core, scene, react |
| `src/sw.ts` | service worker (M8) | core |
| `tools/ephem`, `tools/stars`, `tools/donki`, `tools/neo` | Node pipeline | core, Node |
| `data/` | hand-written inputs: bodies, catalog | — |
| `public/ephem/`, `public/stars.bin`, `public/textures/` | generated or curated assets (committed) | — |
| `tests/` | guards, docs and asset checks | anything |
| `e2e/` | Playwright specs and screenshots | — |

## 3. Store

One Zustand store (`src/app/store/view.ts`): `timeTdb`, `rate`, `playing`, `selection`, `focus`, `camera` (focus, distance, azimuth, elevation), `scaleMode`, `layers`, `prefs`. The URL fragment mirrors the shareable part (VN-UI-002). The scene reads the store in `useFrame` without re-rendering React.

## 4. Loading

The loader fetches the manifest, then the Sun, planet and Moon chunks for the current decade (first frame), then spacecraft chunks on demand or in the background (VN-EPH-010, VN-UI-005). Chunks are content-hashed so the service worker can cache them forever (VN-WEB-003).

## 5. Testing

Unit (Vitest, jsdom for React panels), guards (imports, network, dynamic code), pipeline tests on F1, accuracy on F2 (`ephem:check`), e2e and screenshots on F4/F5 (Playwright), budgets from `renderer.info`. docs/TESTBED.md has the details.
