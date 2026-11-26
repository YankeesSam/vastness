# Data sources

Every data set and asset Vastness ships or uses, with its terms (ADR-0006, VN-DOC-002). A test (T-024) fails when a file under data/, public/ephem/ or public/textures/ is not listed here.

| Source | Provides | Terms | Used as | Retrieved |
|---|---|---|---|---|
| NASA/JPL Horizons, Solar System Dynamics (https://ssd.jpl.nasa.gov/horizons/) | state vectors of the Sun, planets, Moon and spacecraft | US Government work; credit JPL Horizons | public/ephem via tools/ephem (ADR-0002) | (T-020) |
| CelesTrak GP data (https://celestrak.org/NORAD/elements/) | Earth satellite elements (OMM JSON) by NORAD number | check and record terms in T-091; credit CelesTrak | data/satellites via tools/gp (ADR-0007, VN-DAT-009) | (T-093) |
| JPL Horizons lookup API | ID verification | as above | tools/ephem check-ids only | (T-037) |
| IERS Bulletin C (https://www.iers.org/, Leap_Second.dat) | leap seconds (Bulletin C 72, file expires 2027-06-28) | public | src/core/time/leap-seconds.ts | 2026-11-26 |
| JPL "Keplerian Elements for Approximate Positions of the Major Planets" (Standish and Williams 1992, Tables 2a and 2b, https://ssd.jpl.nasa.gov/planets/approx_pos.html) | fallback outside coverage, 3000 BC to 3000 AD | public, published by JPL with the author's permission | src/core/ephem/kepler-approx.ts | 2026-11-26 |
| IAU 2012 B2 (au), IAU 2015 B3 (solar radius), IAU WGCCRE 2015 (Archinal et al. 2018, mean radii), JPL DE440 (Park et al. 2021, GM) | radii, GM, constants | public, cited per value | src/core/constants.ts | 2026-11-26 |
| Textures | planet and Moon surfaces, Saturn's rings | NASA public domain or CC BY with credit (OI-8) | public/textures | (T-062) |
| Bright-star catalog | background stars | per T-064 | public/stars.bin | (T-064) |
