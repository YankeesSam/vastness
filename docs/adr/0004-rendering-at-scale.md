# ADR-0004 Rendering at astronomical scale

Status: accepted (2026-11-26, seed).

## Context

Distances span more than ten orders of magnitude. float32 (the GPU's type) has about 7 significant digits: at 30 AU that is hundreds of km, so objects near the camera jitter and depth fights.

## Decision

- **Floating origin:** the camera is at the render origin; object positions are `world64 - camera64` computed on the CPU in float64 each frame (VN-SCN-004).
- **Logarithmic depth buffer** with near and far adapted to the focus distance (VN-CAM-004).
- **Relative-to-eye lines:** orbit and trail vertices are encoded as high and low float32 pairs, subtracted from the camera's in the vertex shader.
- **Screen-space markers and DOM labels** so every object is visible and pickable at any scale (VN-SCN-003, VN-CAT-005).
- **Scale modes are a pure function** from true positions and radii to drawn ones (VN-SCL-002); nothing else scales objects.

## Consequences

- No multi-camera or multi-pass scale tricks are needed; one scene, one camera.
- Custom shaders for lines (a small amount of GLSL in src/scene), covered by the jitter check and the reference views.
