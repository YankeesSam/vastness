# ADR-0002 Ephemerides are built, not fetched at run time

Status: accepted (2026-11-26, seed; OI-7 may add a live path later).

## Context

The design document suggests client-side calls to the Horizons API with caching, and a serverless proxy for CORS and rate limits. That puts every visitor's browser on JPL's servers, needs a proxy to work at all from a browser, makes the app fail when Horizons is busy, makes accuracy depend on parsing at run time, and leaks nothing but still contacts a third party for every view (VN-GEN-002).

## Decision

- A Node pipeline in tools/ephem queries Horizons at build time, politely and cached (VN-DAT-001..003), fits Chebyshev segments within stated tolerances (VN-EPH-002, 003) and writes compact binary files with a provenance manifest into public/ephem (VN-EPH-004, VN-DAT-005).
- The generated files are committed: the site builds and deploys without the network, diffs show what changed, and a bad Horizons day never breaks a deploy.
- The browser evaluates positions locally in microseconds for any time in coverage, offline included (VN-EPH-005, VN-WEB-003).
- A scheduled workflow refreshes spacecraft predictions and opens a pull request (VN-DAT-006).
- Accuracy is proven by `ephem:check` against held-out Horizons samples (VN-EPH-008).

## Consequences

- No CORS proxy, no rate-limit exposure, no run-time dependency on JPL, no third-party request from the app.
- "Now" positions are as fresh as the last refresh (daily by default); predictions rarely change faster. OI-7 decides whether that is enough.
- The repository carries a few MB of binary data; chunking by object and decade keeps the first load under 1 MB (VN-EPH-010).
