---
name: vastness-scene
description: Rules for Vastness's 3D side - React Three Fiber and three.js, the floating origin and logarithmic depth, relative-to-eye lines and trails, markers, labels and picking, the camera controller and fly-to, scale modes, render budgets, and how scenes are tested with Playwright and SwiftShader. Use when the active task touches src/scene, src/core/camera, src/core/scale, src/core/labels, src/core/trails or src/core/orbits.
metadata:
  type: domain
  version: "1.0"
  project: vastness
---

# Scene and camera

ADR-0004 (rendering at astronomical scale) is the law here.

## Split of work

- The maths lives in src/core as pure functions with unit tests: camera orbit and zoom, fly-to curves, scale mapping, label declutter, trail and orbit sampling, read-outs. src/scene only turns their results into three.js objects.
- A component in src/scene reads the view store and the ephemeris, calls core functions in `useFrame`, and writes into preallocated objects. No `new Vector3()` or array allocation per frame; reuse scratch objects.

## Floating origin and depth (VN-SCN-004, VN-CAM-004)

- The camera sits at the render origin. Every frame, each object's render position is `world64 - camera64`, computed in float64 on the CPU, then written to `object.position` (float32 is fine once the difference is taken).
- Render units are km. `<Canvas gl={{ logarithmicDepthBuffer: true }}>`, near and far adapted from the distance to the focus (near = max(1e-3 km, d x 1e-6), far = 1e12 km); check that no material overrides depth in a way that breaks the log-depth chunk.
- Lines that are long and pass near the camera (orbits, trails) use relative-to-eye encoding: each vertex as a high and a low float32 pair, the camera as high and low uniforms, the subtraction in the vertex shader. A plain float32 line spanning 30 AU is off by hundreds of km near the camera and jitters.
- Test it: the jitter check renders two frames at a fixed time with a 1 m camera move and compares; the scale views (F5) must show no z-fighting at Earth-Moon, inner, outer and 150 AU.

## Markers, labels, picking (VN-SCN-003, VN-CAT-005)

- Markers are screen-space (constant pixel size) instanced sprites or points, always drawn, coloured from the catalog.
- Labels are DOM elements positioned from projected coordinates (crisp text, screen-reader friendly, VN-ACC-002), at most about 60 shown, chosen by the core declutter function by priority and overlap.
- Picking projects object positions to the screen and takes the nearest within 12 px, ties by priority; it does not raycast meshes (a sub-pixel planet must still be pickable).

## Camera (VN-CAM-001..006)

- State: focus (world64 or an object ID), distance, azimuth, elevation. Zoom multiplies distance by a fixed ratio per wheel step; clamp to [object radius x 1.05, 1e11 km].
- Fly-to interpolates log(distance) and the focus position along a curve that rises to a distance that frames both start and end, duration from log of the distance ratio, under 4 s; with reduced motion it cuts (VN-CAM-006).
- Follow keeps the offset to the focus as time runs; Escape or a pan releases.

## Scale modes (VN-SCL-001..003)

- The mode is a pure core function from true positions and radii to drawn ones; the scene never scales objects ad hoc. Exaggerated mode enlarges radii per class and pushes moons out so nothing overlaps (property-tested).

## Performance (VN-PRF-*)

- Budgets in docs/TESTBED.md are checked from `renderer.info` (draw calls, triangles, textures) on the reference scene; fps is only demonstrated on the reference machine (`?stats`).
- When time is paused and the camera idle, render on demand (`frameloop="demand"` with invalidate) to save battery.
- Dispose geometries, materials and textures on unmount.

## Testing scenes

- Playwright headless Chromium renders WebGL through SwiftShader: launch with `--use-angle=swiftshader` and `--enable-unsafe-swiftshader`, DPR 1, a fixed viewport.
- Reference views (F5): URL test params fix the time, camera and layers and turn animation off (`?t=2026-01-01T00:00:00Z&cam=...&still=1`); the app sets `data-scene-ready` on the canvas when the first frame with all data has rendered; specs wait for it before a screenshot.
- Screenshot baselines change only with `--update-snapshots` and a HANDOFF note saying why. Look at a view through one screenshot, never by describing what should be there.
