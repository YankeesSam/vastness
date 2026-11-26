# Vastness

**The solar system at its true scale, and where our spacecraft are in it.**

Vastness is a free, open-source, browser-based planetarium of the Sun, the planets and the robotic explorers of deep space. Fly from a spacecraft a kilometre away to Voyager 1 at the edge of the heliosphere, move through time, and see distances, light-time and speeds that agree with NASA/JPL Horizons, the system mission navigators use.

Status: **seeded, not yet built.** See [docs/ROADMAP.md](docs/ROADMAP.md).

## How it works

- Positions come from [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), fetched at build time, fitted to compact Chebyshev ephemerides, checked against held-out Horizons samples, and shipped with the site ([ADR-0002](docs/adr/0002-build-time-ephemerides.md)). The app makes no third-party requests.
- three.js with React Three Fiber renders from metres to hundreds of AU with a floating origin and a logarithmic depth buffer ([ADR-0004](docs/adr/0004-rendering-at-scale.md)).
- No accounts, no tracking, no cookies.

## Develop

    npm ci
    npm run dev          # local server
    npm test             # unit tests
    npm run e2e          # Playwright
    npm run ephem        # regenerate ephemerides (calls Horizons, cached)
    npm run ephem:check  # accuracy against Horizons reference samples

## Data

Ephemerides: NASA/JPL Solar System Dynamics, Horizons. Every source and its terms: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## Licence

MIT unless the open item OI-1 decides otherwise (docs/REQUIREMENTS.md).
