# Testbed

## Fixtures

| ID | What | Where | Made by |
|---|---|---|---|
| F1 | Recorded Horizons responses (planets, the Moon, a few spacecraft, error cases), trimmed; lookup API responses for every body ID, Voyager 1, JWST and an unknown ID (T-037) | testdata/horizons/ | T-015 (tools/ephem/record.ts) |
| F2 | Held-out Horizons state vectors at epochs not used in fitting, per object | testdata/reference/ | T-019 |
| F3 | Generated ephemerides and manifest | public/ephem/ | `npm run ephem` (T-018, T-020, T-038) |
| F4 | Headless Chromium with SwiftShader WebGL | Playwright | T-005 |
| F5 | Reference views: URL test params `t`, `cam=id,km,azDeg,elDeg`, `still=1`, `layers=`; `data-scene-ready`, `data-orbits`; baselines in e2e/scale.spec.ts-snapshots (Earth-Moon, inner, outer, 150 AU, jitter) | src/app/testparams.ts | T-034 |

No unit test touches the network (VN-DAT-007). Only `tools/ephem/record.ts`, `npm run ephem` and `npm run ephem:refresh` call Horizons.

## Test kinds

| Kind | Command | When |
|---|---|---|
| Unit and guards | `npm test` | every task |
| Types | `npm run typecheck` | every task |
| Format | `npx prettier --check .` | every task |
| e2e and screenshots | `npm run e2e` | tasks touching src/app or src/scene |
| Accuracy | `npm run ephem:check` | tasks touching tools/ephem, data/, public/ephem |
| Benchmarks | `npm run bench` | T-023 and evaluation changes; first run (session 7, this machine, F3 2020s): Earth state 67 ns, Moon geocentric 71 ns, Moon heliocentric (composed) 143 ns per call; budget 2 µs (VN-EPH-005) |

## Budgets (VN-PRF-002, VN-PRF-004)

Set from the first real measurements (T-035, T-073) and only tightened: draw calls, triangles, texture memory on the reference scene; initial download under 1.5 MB compressed (`npm run check-size`, CI); first render under 3 s on simulated fast 4G (e2e/perf.spec.ts, Chrome DevTools "Fast 4G" profile).

First measurements (T-035, session 4, shell with a placeholder Sun): initial download 323 kB compressed (JS 322 kB, of which three.js and React are nearly all); first render 1.0 s on fast 4G in headless Chromium with SwiftShader.

Render budgets (T-073, e2e/budget.spec.ts). Reference scene: `?t=2026-01-01T00:00:00Z&still=1&cam=10,1.2e9,30,25` at 1920x1080, high tier: all planets, the Moon, every catalog spacecraft and Earth satellite with trails a year back and ahead, labels, markers, orbits and the 8,404 stars. Read from `renderer.info` of the last frame (canvas `data-draw-calls`, `data-triangles`, `data-textures`) and the scene's texture memory (`data-texture-bytes`: each texture's data size, or RGBA8 at its size, plus a third for mipmaps).

| Measure | First measurement (session 18) | Budget |
|---|---|---|
| Draw calls | 32 | 64 |
| Triangles | 28,290 | 100,000 |
| Texture memory | 20 KB (2 textures) | 64 MB (textures and topographic maps, T-062, must fit) |

Quality tiers (T-072, src/core/quality.ts): low (pixel ratio 1, 1k textures, 513-point trails, stars to V 5), medium (1.5, 2k, 1025, V 6), high (2, 4k, 2049, V 6.5). Auto picks high on a desktop with at least 4 cores, 8 GB and an 8k texture limit (this machine and the CI runner), low on small GPUs, 2 cores or a phone with 4 GB or 4 cores, medium otherwise. The setting (side panel, Quality) is saved in the preferences.

## Reference machine (VN-PRF-001, OI-9)

Recorded 2026-11-26 from the user (OI-9, W-008):

| Item | Value |
|---|---|
| CPU | AMD Ryzen 7 7800X3D |
| GPU | NVIDIA GeForce RTX 4070 Super |
| Browser | Chrome (version to record at T-075) |
| Display | ultrawide panel, 3440x1440 (confirmed by the user) |

VN-PRF-001 is demonstrated at 1920x1080 and at the panel's native resolution.

Procedure (T-075; a demonstration, D, done by the user on this machine): open the deployed app with `?stats` in Chrome, in a window sized to 1920x1080 and then full screen at 3440x1440, quality High (or Auto, which picks High). Leave the default view playing for 30 s, then open the Whole system preset with Trails "1 year" (two years in all), and note the overlay's fps and p95 frame time and the Chrome version (`chrome://version`) here. Pass: fps at least 59 and p95 under 20 ms at both sizes. The overlay also shows the drawing buffer size (to confirm the resolution) and the renderer counts. In SwiftShader (CI) the same view runs at about 24 fps on the CPU, which says nothing about the GPU.

| Date | Chrome | 1920x1080 | 3440x1440 |
|---|---|---|---|
| (to record) | | | |

## Secrets

| Secret | Needed from | Local (pipeline runs on this machine) | CI |
|---|---|---|---|
| `NASA_API_KEY` (api.nasa.gov, free) | T-086, M9 (DONKI) | `.env` at the repo root (gitignored), read by tools/ only | Actions secret: `gh secret set NASA_API_KEY` |

Horizons, CelesTrak, CNEOS and SBDB need no key. Actions uses its built-in `GITHUB_TOKEN`. No secret is ever named `VITE_*` (Vite would put it in the bundle) or read under src/ (ADR-0005).

## Tools

| Tool | Use |
|---|---|
| Node 22, npm | build, test, pipeline |
| gh | Actions runs, nightly release, Pages |
| Playwright Chromium | e2e, screenshots (`npx playwright install chromium`) |

## CI

`.github/workflows/ci.yml` runs on every push to main and every pull request (superseded runs are cancelled): `npm ci`, `check-deps`, `typecheck`, `format:check`, `npm test`, `npm run build`, then Playwright Chromium e2e once `playwright.config.ts` exists (T-005). Node 22 with the npm cache. `scripts/check-env.sh` prints the latest run on main; `gh run list --workflow ci.yml --branch main --limit 1` shows it in full.

## Agent access

The remote is HTTPS (`https://github.com/YankeesSam/vastness.git`); WSL pushes through the repo-local credential helper, the Windows Git Credential Manager (`git config --local credential.helper "/mnt/c/Program\ Files/Git/mingw64/bin/git-credential-manager.exe"`), as Escapement and Breakout do. SSH to github.com is not set up in WSL. If `git push` fails in an agent shell, the handoff records `push: failed` and the user pushes.

## Web app on the LAN

Dev only. The handoff runs `bash scripts/deploy-web.sh` every session (checked against the first real build in session 3, T-009): it builds, copies `dist/` to `~/.local/state/vastness-web/site` and serves it with `python3 -m http.server` on every interface at port 8770 (`VASTNESS_WEB_PORT`), then prints the URLs with their HTTP status. `--status`, `--stop`, `--no-build` as in Escapement.

One-time Windows step for LAN access under WSL2 NAT, in an administrator PowerShell:

    netsh interface portproxy add v4tov4 listenaddress=<windows lan address> listenport=8770 connectaddress=127.0.0.1 connectport=8770
    New-NetFirewallRule -DisplayName "Vastness web app" -Direction Inbound -Protocol TCP -LocalPort 8770 -Action Allow -Profile Private,Domain

Until that step is done the script reports `windows: http://localhost:8770/ (200)` and `lan: ... (000)`; the app is still reachable from the Windows host itself. Check what is proxied with `netsh interface portproxy show v4tov4`.
