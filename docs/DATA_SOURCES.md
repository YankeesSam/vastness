# Data sources

Every data set and asset Vastness ships or uses, with its terms (ADR-0006, VN-DOC-002). A test (`tests/docs.test.ts`, T-024) fails when a file under data/, testdata/, public/ephem/ or public/textures/ is not named here by its path or a parent directory, when a row lacks a column or a retrieval date (or the task that will add it), when a source file named here is missing, or when the Horizons credit and retrieval dates disagree with public/ephem/manifest.json.

| Source | Provides | Terms | Used as | Retrieved |
|---|---|---|---|---|
| NASA/JPL Horizons, Solar System Dynamics (https://ssd.jpl.nasa.gov/horizons/) | state vectors of the Sun, planets, Moon and the heliocentric spacecraft (T-038; coverage from Horizons' own edges), and of the orbiters relative to their parent (Juno to Jupiter, LRO and CAPSTONE to the Moon, T-089) | US Government work; credit JPL Horizons | public/ephem via tools/ephem (ADR-0002); recorded responses in testdata/horizons (F1, tools/ephem/record.ts); held-out reference samples in testdata/reference (F2, `npm run ephem:check -- --record`) | F1, F2 and public/ephem 2026-11-26; spacecraft (public/ephem, F2) 2026-11-27 |
| CelesTrak GP data (https://celestrak.org/NORAD/elements/) | Earth satellite mean elements (OMM JSON, TEME, SGP4) by NORAD number, derived from US Space Force tracking | freely available from CelesTrak, no licence or credit requirement stated (usage policy read 2026-11-26: one download per 2-hour update, stop at the first non-200); credited as a courtesy | data/satellites.json via `npm run gp` (tools/gp, ADR-0007, VN-DAT-009): per satellite the element epoch, element set number, retrieval instant and source URL; recorded response testdata/gp/25544.json; the satellites chosen are the catalog's `satellite` entries (NORAD numbers and launch dates checked against the CelesTrak SATCAT) | 2026-11-27 |
| JPL Horizons, ISS trajectory (-125544, source "iss") | one day of Earth-centred ISS state vectors after the GP epoch, the independent check of SGP4 and the TEME frames (`npm run gp -- --check-iss`) | as for Horizons | testdata/horizons/iss-2026-11-26.json (tools/gp/gp.test.ts) | 2026-11-27 |
| JPL Horizons lookup API (https://ssd.jpl.nasa.gov/api/horizons_lookup.api) | object names and SPK IDs, to verify every ID we query (VN-DAT-008) | as above | `npm run ephem:check-ids` (tools/ephem/check-ids.ts), through the polite client and cache; recorded responses testdata/horizons/lookup-*.json (F1, tools/ephem/record.ts) | 2026-11-27 |
| IERS Bulletin C (https://www.iers.org/, Leap_Second.dat) | leap seconds (Bulletin C 72, file expires 2027-06-28) | public | src/core/time/leap-seconds.ts | 2026-11-26 |
| IAU 2012 B2 (au), IAU 2015 B3 (solar radius), IAU WGCCRE 2015 (Archinal et al. 2018, mean radii), JPL DE440 (Park et al. 2021, GM) | radii, GM, constants | public, cited per value | src/core/constants.ts | 2026-11-26 |
| Vastness (this project) | data/bodies.json: which bodies, centres, sample steps and tolerances the pipeline generates | Apache-2.0 (this repository) | tools/ephem/main.ts | 2026-11-26 |
| Vastness (this project) | data/orbiters.json: the orbiters stored relative to their parent (Juno at Jupiter, LRO and CAPSTONE at the Moon), their tolerances, the build date the window is centred on, the window and the 5 MB budget (OI-6) | Apache-2.0 (this repository) | tools/ephem/orbiters.ts (VN-EPH-009, VN-EPH-011) | 2026-11-26 |
| Vallado, Crawford, Hujsak and Kelso, "Revisiting Spacetrack Report #3", AIAA 2006-6753 (https://celestrak.org/publications/AIAA/2006-6753/) | SGP4 verification element sets and the reference code's TEME output (testdata/sgp4/SGP4-VER.TLE, testdata/sgp4/tmatver.out from the MATLAB version, Dec 2015) | published with the paper for verifying implementations; no licence stated; used only as test reference, not shipped | src/core/sgp4/sgp4.test.ts (T-092) | 2026-11-26 |
| Vastness (this project), with mission facts from NASA, ESA and JPL mission pages | data/catalog.json: names, types, parents, launch dates, mission status with as-of date, agencies, summaries and goals written in our own words, source links (Earth satellites: NORAD numbers, ADR-0007), colours and priorities (VN-CAT-001) | Apache-2.0 (this repository); facts are not copyrightable, no text copied; each entry links its sources | src/core/catalog/schema.ts; IDs verified by `npm run ephem:check-ids` | 2026-11-26 |
| Textures | planet and Moon surfaces, Saturn's rings | NASA public domain or CC BY with credit (OI-8) | public/textures | (T-062) |
| NASA 3D Resources (https://science.nasa.gov/3d-resources/), ESA for JUICE | spacecraft 3D models | check and record per model in T-096; credit as each asks | public/models via tools/models | (T-096) |
| Bright-star catalog | background stars | per T-064 | public/stars.bin | (T-064) |

## Credits

Shown in the app's About panel and in release notes, and carried in public/ephem/manifest.json (`credit`):

- State vectors from the JPL Horizons system (NASA/JPL Solar System Dynamics Group)
- Leap seconds from IERS Bulletin C (International Earth Rotation and Reference Systems Service)
- Orbital elements from CelesTrak (celestrak.org)

Horizons output is produced by NASA/JPL and is not subject to copyright in the United States; JPL asks that it be credited to the Horizons system. Neither NASA nor JPL endorses Vastness, and nothing in the app uses their logos.
