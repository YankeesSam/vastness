# Ephemeris format

How Vastness stores positions: the binary file (VN-EPH-004), the manifest that describes the files (VN-DAT-005) and how the coefficients are fitted (VN-EPH-002, VN-EPH-003). Code: `src/core/ephem/format.ts` (reader and writer), `src/core/ephem/chebyshev.ts` (fit and evaluation), `src/core/ephem/elements.ts` (element segments), `src/core/ephem/ephemeris.ts` (runtime loading and composition). A change to the layout bumps the format version and updates this document in the same task.

Format version: 2

Version 2 adds element segments (VN-EPH-011). Position files keep the version-1 layout and version number, so every file written before version 2 is still valid and byte-identical; element files are version 2. Readers accept both.

## Conventions

- Time is TDB seconds since J2000 (JD 2451545.0 TDB), float64 (ADR-0003).
- Positions are km in the ecliptic and mean equinox of J2000 (Horizons `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`), geometric, relative to the file's centre; velocities are km/s and are not stored (position files: the derivative of the position polynomial; element files: the two-body velocity of the osculating elements).
- Every number is little-endian. Readers use `DataView`; no text is parsed.

## File layout

One file holds one object relative to one centre over a contiguous span of time, as a sequence of segments of one kind and one degree. Byte offsets:

| Offset | Size | Type | Field | Meaning |
|---|---|---|---|---|
| 0 | 4 | ASCII | `magic` | `"VNEP"` |
| 4 | 2 | u16 | `version` | 1 for position files, 2 for element files |
| 6 | 2 | u16 | `header_bytes` | 64 in version 1, 80 in version 2 |
| 8 | 4 | i32 | `object_id` | Horizons ID of the object (spacecraft are negative) |
| 12 | 4 | i32 | `center_id` | Horizons ID of the centre (10 the Sun, 399 Earth, ...) |
| 16 | 2 | u16 | `degree` | polynomial degree; each axis has degree + 1 coefficients |
| 18 | 2 | u16 | `components` | 3 for positions (x, y, z), 6 for elements |
| 20 | 4 | u32 | `segment_count` | number of segments |
| 24 | 8 | f64 | `coverage_start` | t0 of the first segment |
| 32 | 8 | f64 | `coverage_end` | t1 of the last segment |
| 40 | 4 | u32 | `segment_table_offset` | byte offset of the segment table (`header_bytes`) |
| 44 | 4 | u32 | `coefficients_offset` | byte offset of the coefficients (a multiple of 8) |
| 48 | 16 | | reserved | version 1: zero (the rest of the header) |
| 48 | 2 | u16 | `kind` | version 2: 0 position, 1 elements |
| 50 | 6 | | reserved | version 2: zero |
| 56 | 8 | f64 | `mu` | version 2, element files: GM of the centre, km^3/s^2 (0 for positions) |
| 64 | 8 | f64 | `mean_motion` | version 2, element files: reference mean motion n, rad/s |
| 72 | 8 | | reserved | version 2: zero |

Segment table: `segment_count` entries of 16 bytes, each `t0` (f64) and `t1` (f64). Segments are contiguous (`t1` of one is `t0` of the next) and ascending; a time equal to `coverage_end` belongs to the last segment.

Coefficients: `segment_count` x `components` x (degree + 1) f64, segment-major, then component, then coefficient index 0..degree.

The file length is exactly `coefficients_offset + segment_count * components * (degree + 1) * 8`; a reader rejects any other length, an unknown version or kind, a header size or component count that does not match the version and kind, an element file without a positive `mu`, bad magic, or a segment table that is not contiguous or does not match the coverage.

## Evaluation

For a time t in segment [t0, t1]: tau = (2t - t0 - t1) / (t1 - t0); each axis is sum c_k T_k(tau) by the Clenshaw recurrence, and the velocity is the Clenshaw derivative times 2 / (t1 - t0). The evaluator writes into a caller-supplied array and allocates nothing (VN-EPH-005). Objects bound to a parent (the Moon, orbiters) are stored relative to it and composed at evaluation (VN-EPH-009).

## Element segments (VN-EPH-011)

For orbiters (lunar orbiters, Juno), whose position changes direction many times a day but whose orbit changes slowly. The six components are the osculating elements relative to the file's centre: semi-major axis a (km), eccentricity e, inclination i, longitude of the ascending node, argument of periapsis (rad, in the ecliptic J2000 frame), and L = M - n t (rad), where M is the mean anomaly, n is `mean_motion` and t is TDB seconds since J2000. Angles are unwrapped (continuous) within a segment. Elliptic orbits only.

Evaluation: each component by the Clenshaw recurrence at tau, M = L + n t, Kepler's equation M = E - e sin E by Newton iteration (at most 30 steps, from M + e sin M, or from pi when e >= 0.8), then the perifocal position and two-body velocity with `mu`, rotated by node, inclination and periapsis. For osculating elements the two-body velocity is the true velocity. On a synthetic polar orbit 100 km above the Moon with J2, and an e = 0.6 lunar orbit perturbed by Earth, element segments stay within the 2 km tolerance where position segments of the same size miss by hundreds of km (`src/core/ephem/elements.test.ts`). Where e is near zero the periapsis and M are individually ill defined; the pipeline fits both kinds and keeps the one that meets the tolerance (T-089).

## Manifest

`public/ephem/manifest.json`, written by `npm run ephem` (`tools/ephem/main.ts`) from `data/bodies.json`, with keys sorted at every level, two-space indent, LF, and no timestamps beyond the retrieval dates. Chunk files are `public/ephem/<id>/<first year>.bin`, one per object and chunk (`chunk_years`, a decade), so the app loads the current decade first (VN-EPH-010; a 2020s decade of the Sun, planets and Moon is about 0.5 MB).

Top level: `format_version` (the highest file version it lists; 1 while every file holds positions), `frame`, `credit` (JPL Horizons), `chunk_years`, `objects` (ascending ID). The frame origin (the Sun) is `{ id, name, origin: true }` with no files. Every other object:

| Key | Meaning |
|---|---|
| `id`, `name` | Horizons ID and name |
| `center` | Horizons ID of the centre the file is relative to |
| `query` | the Horizons query parameters used, sorted, without START_TIME and STOP_TIME (those are per chunk) |
| `retrieved` | latest UTC date (YYYY-MM-DD) among the chunks, from each cached response's own Date header |
| `source` | the `{source: ...}` of the response header's target line (e.g. DE441), distinct values joined by `; ` |
| `coverage` | `start`, `end` in TDB seconds since J2000 and `start_tdb`, `end_tdb` as dates |
| `chunks` | per file: `file`, `coverage`, `bytes`, `sha256`, `degree`, `segments`, `max_error_km`, `retrieved`, `start_time`, `stop_time`, `target` (the Horizons ID actually queried) |
| `tolerance_km` | the object's fit tolerance (VN-EPH-003) |
| `max_error_km` | `km`, `epoch` (TDB s) and `jd_tdb` of the largest error at held-out points |
| `misses` | segments that did not reach the tolerance at the step limit: `t0`, `t1`, `error_km` |
| `fallbacks` | chunks where Horizons had no ephemeris for the planet centre and the barycentre was used: `file`, `target` |

Before fitting, the pipeline checks that the response's target, centre, frame (Ecliptic of J2000.0) and time scale (TDB) are what was asked for, and that the records run from the chunk start to its end at the requested step; anything else stops the run.

## Fitting method

1. Sample the object from Horizons (geometric state vectors, TDB) over each chunk at `step_hours` (a divisor of 12 h, so every chunk has an even number of intervals). Even-indexed samples are fitted; odd-indexed ones, the midpoints, are held out.
2. For each segment, fit each axis by least squares (Householder QR) to the position samples, with the velocity samples as extra rows scaled to position units over the segment. Each degree 7..13 is fitted adaptively and the passing one with the fewest coefficients is kept (one degree per file); acceptance is by held-out error, not by the residuals at the fitted points (`tools/ephem/fit.ts`).
3. Check the fit at held-out points, the midpoints between samples. If the error exceeds the object's tolerance (10 km planets and Moon, 50 km spacecraft in cruise, 2 km low lunar orbiters), halve the segment and repeat, down to the sample step limit; a segment that still misses is listed in `misses`.
4. `npm run ephem:check` compares every file with reference samples not used in the fit (F2) and fails above tolerance (VN-EPH-008).
