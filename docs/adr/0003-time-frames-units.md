# ADR-0003 Time, frames and units

Status: accepted (2026-11-26, seed).

## Context

Horizons vectors are in TDB; users think in UTC; leap seconds and the TDB-TT difference are small but real. Positions span 1 km to 1e10 km. Mixing scales or frames is the classic source of silent error.

## Decision

- **Time:** inside the core, TDB seconds since J2000 as float64. UTC only at the interface and in ISO strings. One module (src/core/time) converts UTC <-> TAI <-> TT <-> TDB with the IERS leap-second table (VN-EPH-001).
- **Frame:** heliocentric, ecliptic and mean equinox of J2000 (Horizons `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`), geometric states (no light-time or aberration correction).
- **Units:** km and km/s; au = 149,597,870.7 km; c = 299,792.458 km/s. Constants with sources in src/core/constants.ts.
- **Axes:** the scene's y-up mapping `(x, y, z) -> (x, z, -y)` exists once, in src/core/frames.ts.

## Consequences

- Read-outs are geometric distances and instantaneous light-time (distance / c), which is what "how far away is it now" means; the info text says so.
