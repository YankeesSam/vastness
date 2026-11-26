---
name: vastness-ephemeris
description: Rules for Vastness's data side - the Horizons pipeline (query, polite client, cache, parser), time scales (UTC, TAI, TT, TDB), frames and units, Chebyshev fitting and evaluation, the binary ephemeris format, accuracy checks and provenance. Use when the active task touches src/core/time, src/core/ephem, src/core/frames.ts, src/core/constants.ts, tools/, data/, testdata/ or public/ephem.
metadata:
  type: domain
  version: "1.0"
  project: vastness
---

# Ephemeris and time

ADR-0002 (build-time ephemerides) and ADR-0003 (time, frames, units) are the law here.

## Horizons API

- Endpoint `https://ssd.jpl.nasa.gov/api/horizons.api`, GET, `format=json`. Values are quoted with single quotes and URL-encoded: `COMMAND='-31'`.
- State vectors: `EPHEM_TYPE='VECTORS'`, `CENTER='500@10'` (Sun centre; `'500@399'` Earth centre for the Moon; `'500@301'` the Moon for lunar orbiters; `'500@599'` Jupiter), `REF_PLANE='ECLIPTIC'`, `REF_SYSTEM='ICRF'`, `OUT_UNITS='KM-S'`, `VEC_TABLE='2'` (position and velocity), `VEC_CORR='NONE'` (geometric, no light-time or aberration), `TIME_TYPE='TDB'`, `CSV_FORMAT='YES'`, `OBJ_DATA='NO'`, `START_TIME`, `STOP_TIME`, `STEP_SIZE` (`'1 d'`, `'60 m'`).
- IDs: Sun 10, Mercury 199, Venus 299, Earth 399 (not 3, the Earth-Moon barycentre), Moon 301, Mars 499, Jupiter 599, Saturn 699, Uranus 799, Neptune 899; barycentres 1..9. Spacecraft are negative (Voyager 1 is -31); the catalog's IDs are verified by `check-ids` against `horizons_lookup.api` (VN-DAT-008), never trusted from memory.
- The JSON has `signature` and `result` (the text report) or `error`. Vectors sit between `$$SOE` and `$$EOE`; with CSV each record is `JDTDB, Calendar Date (TDB), X, Y, Z, VX, VY, VZ,`. Errors arrive as an `error` field or as text in `result` ("No ephemeris for target", "Multiple major-bodies match", "Cannot ... "): parse both, and quote the query in the message.
- A request returns at most about 90,000 lines; split long spans into several requests and stitch them, checking the seam epochs agree.
- Planet centres (599, 699, ...) come from satellite solutions with limited spans; if a span is refused, fall back to the barycentre for that span and record it in the manifest.

## Polite client (VN-DAT-002, VN-DAT-003)

- One request in flight, 1 s minimum spacing, exponential backoff with jitter on 503 and network errors, a budget per run, User-Agent `vastness-ephemeris-pipeline (+repository URL)`; no personal data in headers.
- Cache key: SHA-256 of the canonical query (sorted parameters). Cache files hold the response body exactly; `--offline` turns a miss into an error.
- Tests inject `fetch` and a clock; nothing in tests touches the network (VN-DAT-007).

## Time (VN-EPH-001)

- Inside the core, time is **TDB seconds since J2000** (J2000 = JD 2451545.0 TDB) as a float64. UTC exists only at the UI edge and in ISO strings.
- UTC -> TAI: add TAI-UTC from the leap-second table (37 s since 2017-01-01; table from IERS Bulletin C, with the date it is known to). Before 1972 UTC had rubber seconds: the app accepts only dates the table covers for exact conversion and documents the approximation before 1972.
- TT = TAI + 32.184 s. TDB - TT = 0.001657 sin(g) + 0.000014 sin(2g) seconds, g = 357.53 deg + 0.98560028 deg x (JD_TT - 2451545.0): under 30 microseconds of error.
- Reference checks: 2016-12-31T23:59:60 UTC exists; 2017-01-01T00:00:00 UTC is TT 00:01:09.184. Take reference values from IERS or the Astronomical Almanac, never from our own code.
- JD as a float64 resolves about 40 microseconds at today's dates; keep seconds since J2000 instead of JD wherever arithmetic happens.

## Frames and units (ADR-0003)

- Positions in km, velocities in km/s, heliocentric ecliptic J2000 (Horizons ECLIPTIC with ICRF). au = 149,597,870.7 km (IAU 2012). c = 299,792.458 km/s.
- The core never knows about three.js axes. The one conversion to the scene's y-up frame, `(x, y, z) -> (x, z, -y)`, lives in src/core/frames.ts and is the only place it happens.
- Never put positions in Float32Array in the core. Float64Array or plain numbers.

## Chebyshev ephemerides (VN-EPH-002..005)

- Each segment covers [t0, t1]; tau = (2t - t0 - t1) / (t1 - t0). Position = sum c_k T_k(tau) per axis; velocity = d/dtau x 2 / (t1 - t0).
- Fit by least squares on the Horizons samples in the segment (use the velocities as extra constraints when it improves the held-out error). Degree 7..13; choose by held-out error, not by residuals on the fitted points.
- Held-out points are midpoints between samples; adaptive subdivision halves a segment until the tolerance holds (10 km planets and Moon, 50 km spacecraft) or the step limit is hit, then lists the miss in the manifest. Never loosen a tolerance to get green.
- Evaluate with the Clenshaw recurrence into a caller-supplied output array; no allocation per call (VN-EPH-005).
- Moons and planet-bound spacecraft are stored relative to their parent and composed at evaluation (VN-EPH-009).
- Orbiters can use element segments (VN-EPH-011): Chebyshev fits of osculating elements (a, e, i, node, argument of periapsis, and M - n t so the fitted quantity varies slowly), position from Kepler's equation (Newton iteration, a fixed iteration cap, tested at e near 0 and near 0.9 for CAPSTONE's orbit). The pipeline fits both kinds and keeps the smaller within tolerance; low lunar orbiters need 2 km. Measure the whole-mission size and error before choosing full mission or window; never decide by estimate. Outside the stored span show an illustrative orbit, labelled, never an extrapolated exact position.

## Binary format and manifest (VN-EPH-004, VN-DAT-005)

- Little-endian via DataView; header with magic, format version, object ID, centre ID, coverage, degree, segment count; segment table; coefficients as float64. Layout in docs/EPHEMERIS_FORMAT.md, updated in the same task as any change, with a version bump.
- The manifest is JSON with sorted keys: per object the query, retrieval date (UTC date only), source line from the Horizons header, coverage, chunk files with content hashes, achieved max error, misses.
- Two runs on the same cache give byte-identical output (VN-GEN-010): fixed float formatting, stable sorts, no wall-clock time except the retrieval date taken from the cached response's own date header.

## Accuracy (VN-EPH-008)

- `npm run ephem:check` compares each ephemeris with F2 samples that were not used in fitting, prints one table row per object (max error km, epoch of the max, tolerance, pass), and exits non-zero on any failure. Read that table, never the binaries.
- A disagreement with Horizons beyond tolerance found anywhere is a `type:acc` defect.

## Data hygiene

- Raw responses: `.cache/horizons/` (gitignored). Recorded fixtures for tests: testdata/horizons (F1), trimmed to a few dozen lines each. Held-out samples: testdata/reference (F2).
- Every new data source goes into docs/DATA_SOURCES.md in the same task, with source, terms and retrieval date (ADR-0006). Credit JPL Horizons as JPL asks.
