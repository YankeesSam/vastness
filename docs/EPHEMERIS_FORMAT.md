# Ephemeris format

How Vastness stores positions: the binary file (VN-EPH-004), the manifest that describes the files (VN-DAT-005) and how the coefficients are fitted (VN-EPH-002, VN-EPH-003). Code: `src/core/ephem/format.ts` (reader and writer), `src/core/ephem/chebyshev.ts` (fit and evaluation). A change to the layout bumps the format version and updates this document in the same task.

Format version: 1

## Conventions

- Time is TDB seconds since J2000 (JD 2451545.0 TDB), float64 (ADR-0003).
- Positions are km in the ecliptic and mean equinox of J2000 (Horizons `REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`), geometric, relative to the file's centre; velocities are km/s and are not stored (they are the derivative of the position polynomial).
- Every number is little-endian. Readers use `DataView`; no text is parsed.

## File layout

One file holds one object relative to one centre over a contiguous span of time, as a sequence of segments with the same degree. Byte offsets:

| Offset | Size | Type | Field | Meaning |
|---|---|---|---|---|
| 0 | 4 | ASCII | `magic` | `"VNEP"` |
| 4 | 2 | u16 | `version` | format version, 1 |
| 6 | 2 | u16 | `header_bytes` | 64 |
| 8 | 4 | i32 | `object_id` | Horizons ID of the object (spacecraft are negative) |
| 12 | 4 | i32 | `center_id` | Horizons ID of the centre (10 the Sun, 399 Earth, ...) |
| 16 | 2 | u16 | `degree` | polynomial degree; each axis has degree + 1 coefficients |
| 18 | 2 | u16 | `components` | 3 (x, y, z) |
| 20 | 4 | u32 | `segment_count` | number of segments |
| 24 | 8 | f64 | `coverage_start` | t0 of the first segment |
| 32 | 8 | f64 | `coverage_end` | t1 of the last segment |
| 40 | 4 | u32 | `segment_table_offset` | byte offset of the segment table (64) |
| 44 | 4 | u32 | `coefficients_offset` | byte offset of the coefficients (a multiple of 8) |
| 48 | 16 | | reserved | zero |

Segment table: `segment_count` entries of 16 bytes, each `t0` (f64) and `t1` (f64). Segments are contiguous (`t1` of one is `t0` of the next) and ascending; a time equal to `coverage_end` belongs to the last segment.

Coefficients: `segment_count` x 3 x (degree + 1) f64, segment-major, then axis (x, y, z), then coefficient index 0..degree.

The file length is exactly `coefficients_offset + segment_count * 3 * (degree + 1) * 8`; a reader rejects any other length, an unknown version, bad magic, or a segment table that is not contiguous or does not match the coverage.

## Evaluation

For a time t in segment [t0, t1]: tau = (2t - t0 - t1) / (t1 - t0); each axis is sum c_k T_k(tau) by the Clenshaw recurrence, and the velocity is the Clenshaw derivative times 2 / (t1 - t0). The evaluator writes into a caller-supplied array and allocates nothing (VN-EPH-005). Objects bound to a parent (the Moon, orbiters) are stored relative to it and composed at evaluation (VN-EPH-009).

## Manifest

`public/ephem/manifest.json`, written by `npm run ephem` (T-018) with sorted keys and no timestamps beyond the retrieval date. One entry per object:

| Key | Meaning |
|---|---|
| `id` | Horizons ID |
| `center` | Horizons ID of the centre |
| `query` | the Horizons query parameters used, sorted |
| `retrieved` | UTC date (YYYY-MM-DD) from the cached response's own date |
| `source` | the ephemeris source line from the Horizons response header (e.g. the DE solution) |
| `coverage` | `[start, end]` in TDB seconds since J2000 and as ISO dates |
| `chunks` | files, each with its coverage, byte size and SHA-256 |
| `tolerance_km` | the object's fit tolerance (VN-EPH-003) |
| `max_error_km` | the largest error achieved at held-out points, with its epoch |
| `misses` | segments that did not reach the tolerance at the step limit, with their error |

## Fitting method

1. Sample the object from Horizons (geometric state vectors, TDB) over the span.
2. For each segment, fit each axis by least squares (Householder QR) to the position samples, with the velocity samples as extra rows scaled to position units over the segment. Degree 7..13, chosen by held-out error, not by the residuals at the fitted points.
3. Check the fit at held-out points, the midpoints between samples. If the error exceeds the object's tolerance (10 km planets and Moon, 50 km spacecraft in cruise, 2 km low lunar orbiters), halve the segment and repeat, down to the sample step limit; a segment that still misses is listed in `misses`.
4. `npm run ephem:check` compares every file with reference samples not used in the fit (F2) and fails above tolerance (VN-EPH-008).
