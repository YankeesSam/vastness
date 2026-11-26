# ADR-0006 Data and asset licensing

Status: accepted (2026-11-26, seed; texture sources wait on OI-8).

## Context

Vastness ships data (ephemerides, constants, a star catalog), images (planet textures) and text (mission summaries) from other sources. Open source needs each one's terms honoured and visible.

## Decision

- docs/DATA_SOURCES.md lists every data set and asset: source URL, licence or terms, retrieval date, how it is used, required credit (VN-DOC-002). A test fails when a file under data/, public/ephem/ or public/textures/ is not listed.
- Horizons output is credited to NASA/JPL Solar System Dynamics as JPL asks.
- Mission summaries and science goals are written in our own words, with links to the agency pages; nothing is copied or scraped at run time.
- Textures only from sources OI-8 approves; NASA imagery is generally public domain, other agencies' and artists' sets need their licence and credit.
- The About box shows credits (VN-UI-004).

## Consequences

- Adding an asset is always two edits: the file and its DATA_SOURCES line.
