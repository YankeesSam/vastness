# ADR-0006 Data and asset licensing

Status: accepted (2026-11-26, seed; OI-8 answered 2026-11-26: NASA public domain and CC BY with credit).

## Context

Vastness ships data (ephemerides, constants, a star catalog), images (planet textures) and text (mission summaries) from other sources. Open source needs each one's terms honoured and visible.

## Decision

- docs/DATA_SOURCES.md lists every data set and asset: source URL, licence or terms, retrieval date, how it is used, required credit (VN-DOC-002). A test fails when a file under data/, public/ephem/ or public/textures/ is not listed.
- Horizons output is credited to NASA/JPL Solar System Dynamics as JPL asks.
- Mission summaries and science goals are written in our own words, with links to the agency pages; nothing is copied or scraped at run time.
- Textures from NASA public domain imagery or CC BY sets (such as Solar System Scope), each credited as its licence requires (OI-8); anything else needs the user's approval.
- The project's own code and docs are Apache-2.0 (OI-1, VN-GEN-007): LICENSE and NOTICE at the root; CelesTrak GP data terms are recorded in DATA_SOURCES (ADR-0007).
- The About box shows credits (VN-UI-004).

## Consequences

- Adding an asset is always two edits: the file and its DATA_SOURCES line.
