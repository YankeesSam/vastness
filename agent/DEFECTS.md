# DEFECTS

Open then closed. Do not delete rows.

## Open

- [ ] D-001 sev:low type:env task:unplanned src:test  npm audit: vitest 3.2.7 (matched to Escapement per ADR-0001) pulls tinypool <=2.1.1 with two critical advisories (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr); dev-only, nothing ships; fix is vitest 5 (breaking), best done with Escapement
- [ ] D-002 sev:low type:ui task:unplanned src:T-055  exaggerated scale: spacecraft and satellite markers are pushed out of enlarged bodies (mapSmall), but their trails stay at true positions, so near a body a trail and its marker part (e.g. LRO around the Moon); trails would need the same mapping per vertex
- [ ] D-003 sev:low type:ui task:unplanned src:T-063  Saturn's shadow on its rings (and the rings' shadow on Saturn) is not drawn; at the 2017 solstice view the night-side ring arc is as bright as the lit one

## Closed

