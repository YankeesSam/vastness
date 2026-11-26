# ADR-0005 Hosting and privacy

Status: accepted (2026-11-26, seed; OI-3 answered 2026-11-26: GitHub Pages; the domain waits on OI-2).

## Context

The design calls for a free, open, private tool: no tracking, data client-side. The user chose GitHub for the repository.

## Decision

- **Static site** on GitHub Pages, deployed by GitHub Actions from main (VN-WEB-001); a custom domain when OI-2 is settled (VN-WEB-004).
- **No server code, no accounts, no analytics, no cookies, no third-party requests**; preferences in localStorage only (VN-GEN-002, VN-GEN-008).
- **Strict CSP** (VN-GEN-009). Outbound links (mission pages) open in a new tab with `noopener noreferrer`.
- **Sharing by URL fragment**, never sent to a server (VN-WEB-002).
- **Secrets** (a NASA API key for DONKI, M9) live only in Actions secrets and are used at build time, never shipped (VN-EXT-001).

## Consequences

- GitHub Pages on the free plan needs a public repository (OI-3).
- A proxy for live data would be a new ADR (OI-7).
