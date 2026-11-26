# Vastness

**The solar system at its true scale, and where our spacecraft are in it.**

Vastness is a free, open-source, browser-based planetarium of the Sun, the planets and the robotic explorers of deep space. Fly from a spacecraft a kilometre away to Voyager 1 at the edge of the heliosphere, move through time, and see distances, light-time and speeds that agree with NASA/JPL Horizons, the system mission navigators use.

Status: **early development (M0, bootstrap).** See [docs/ROADMAP.md](docs/ROADMAP.md).

## How it works

- Positions come from [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), fetched at build time, fitted to compact Chebyshev ephemerides, checked against held-out Horizons samples, and shipped with the site ([ADR-0002](docs/adr/0002-build-time-ephemerides.md)). The app makes no third-party requests.
- three.js with React Three Fiber renders from metres to hundreds of AU with a floating origin and a logarithmic depth buffer ([ADR-0004](docs/adr/0004-rendering-at-scale.md)).
- No accounts, no tracking, no cookies.

## Develop

    npm ci
    npm run dev          # local server
    npm run build        # static site in dist/
    npm test             # unit tests
    npm run check-deps   # runtime dependency allowlist and THIRD_PARTY_NOTICES.txt
    npm run e2e          # Playwright
    npm run ephem        # regenerate ephemerides (calls Horizons, cached)
    npm run ephem:check  # accuracy against Horizons reference samples

## Data

Ephemerides: NASA/JPL Solar System Dynamics, Horizons. Every source and its terms: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## Licence

Vastness is open source under the Apache License 2.0: see [LICENSE](LICENSE) and [NOTICE](NOTICE). If you redistribute it or build on it, keep the NOTICE file, mark the files you changed, and give your work its own name. Bundled third-party packages and their licences are listed in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt), which ships with the built app alongside LICENSE and NOTICE.
