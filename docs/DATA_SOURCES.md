# Data sources

Every data set and asset Vastness ships or uses, with its terms (ADR-0006, VN-DOC-002). A test (T-024) fails when a file under data/, public/ephem/ or public/textures/ is not listed here.

| Source | Provides | Terms | Used as | Retrieved |
|---|---|---|---|---|
| NASA/JPL Horizons, Solar System Dynamics (https://ssd.jpl.nasa.gov/horizons/) | state vectors of the Sun, planets, Moon and spacecraft | US Government work; credit JPL Horizons | public/ephem via tools/ephem (ADR-0002) | (T-020) |
| JPL Horizons lookup API | ID verification | as above | tools/ephem check-ids only | (T-037) |
| IERS Bulletin C (https://www.iers.org/) | leap seconds | public | src/core/time/leap-seconds.ts | (T-011) |
| JPL "Keplerian Elements for Approximate Positions of the Major Planets" (Standish) | fallback outside coverage | public | src/core/ephem/kepler-approx.ts | (T-022) |
| IAU and NASA planetary fact sheets | radii, GM, constants | public | src/core/constants.ts | (T-012) |
| Textures | planet and Moon surfaces, Saturn's rings | per OI-8 | public/textures | (T-062) |
| Bright-star catalog | background stars | per T-064 | public/stars.bin | (T-064) |
