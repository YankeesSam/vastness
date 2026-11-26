# Testbed

## Fixtures

| ID | What | Where | Made by |
|---|---|---|---|
| F1 | Recorded Horizons responses (planets, the Moon, a few spacecraft, error cases), trimmed | testdata/horizons/ | T-015 (tools/ephem/record.ts) |
| F2 | Held-out Horizons state vectors at epochs not used in fitting, per object | testdata/reference/ | T-019 |
| F3 | Generated ephemerides and manifest | public/ephem/ | `npm run ephem` (T-018, T-020, T-038) |
| F4 | Headless Chromium with SwiftShader WebGL | Playwright | T-005 |
| F5 | Reference views: URL test params fixing time, camera, layers; `data-scene-ready` | src/app/testparams.ts | T-034 |

No unit test touches the network (VN-DAT-007). Only `tools/ephem/record.ts`, `npm run ephem` and `npm run ephem:refresh` call Horizons.

## Test kinds

| Kind | Command | When |
|---|---|---|
| Unit and guards | `npm test` | every task |
| Types | `npm run typecheck` | every task |
| Format | `npx prettier --check .` | every task |
| e2e and screenshots | `npm run e2e` | tasks touching src/app or src/scene |
| Accuracy | `npm run ephem:check` | tasks touching tools/ephem, data/, public/ephem |
| Benchmarks | `npx vitest bench` | T-023 and evaluation changes |

## Budgets (VN-PRF-002, VN-PRF-004)

Set from the first real measurements (T-035, T-073) and only tightened: draw calls, triangles, texture memory on the reference scene; initial download under 1.5 MB compressed; first render under 3 s on simulated fast 4G.

## Reference machine (VN-PRF-001, OI-9)

To be recorded by the user: CPU, GPU, browser and version, display resolution.

## Tools

| Tool | Use |
|---|---|
| Node 22, npm | build, test, pipeline |
| gh | Actions runs, nightly release, Pages |
| Playwright Chromium | e2e, screenshots (`npx playwright install chromium`) |

## Agent access

The remote is HTTPS (`https://github.com/YankeesSam/vastness.git`); WSL pushes through the repo-local credential helper, the Windows Git Credential Manager (`git config --local credential.helper "/mnt/c/Program\ Files/Git/mingw64/bin/git-credential-manager.exe"`), as Escapement and Breakout do. SSH to github.com is not set up in WSL. If `git push` fails in an agent shell, the handoff records `push: failed` and the user pushes.

## Web app on the LAN

Dev only. The handoff runs `bash scripts/deploy-web.sh` every session once T-004 has landed: it builds, copies `dist/` to `~/.local/state/vastness-web/site` and serves it with `python3 -m http.server` on every interface at port 8770 (`VASTNESS_WEB_PORT`), then prints the URLs with their HTTP status. `--status`, `--stop`, `--no-build` as in Escapement.

One-time Windows step for LAN access under WSL2 NAT, in an administrator PowerShell:

    netsh interface portproxy add v4tov4 listenaddress=<windows lan address> listenport=8770 connectaddress=127.0.0.1 connectport=8770
    New-NetFirewallRule -DisplayName "Vastness web app" -Direction Inbound -Protocol TCP -LocalPort 8770 -Action Allow -Profile Private,Domain
