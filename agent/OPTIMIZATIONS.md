# OPTIMIZATIONS

- [x] O-001 tool:node status:installed gain:build, test, pipeline; Node 22.23 and npm 10 in WSL (nvm)
- [x] O-002 tool:gh status:available gain:repo, runs, releases, PRs; logged in as YankeesSam
- [x] O-003 tool:git-remote status:ok gain:HTTPS remote through the repo-local Windows Git Credential Manager helper, as Escapement (SSH to github.com has no known_hosts entry in WSL)
- [x] O-004 tool:prettier-hook status:applied gain:every .ts/.tsx/.css/.json file the agent writes is formatted (.claude/hooks/prettier-on-edit.sh) once prettier is in node_modules
- [x] O-005 token:req-ids status:applied gain:tasks cite VN-* IDs; grep docs/REQUIREMENTS.md instead of loading it
- [x] O-006 token:domain-skills status:applied gain:vastness-ephemeris and vastness-scene hold the hard-won rules (time scales, frames, float64, log depth) so execute loads only the one the task needs
- [ ] O-007 tool:playwright-browsers status:to-install gain:e2e and screenshots (T-005); after T-001: `npx playwright install chromium` (`--with-deps` needs sudo: the user runs it)
- [ ] O-008 token:horizons-cache status:planned gain:raw Horizons responses cached in .cache/horizons by query hash (T-016); reruns cost no network and no tokens; never read raw responses into context, run `npm run ephem:check` and read its table
- [ ] O-009 token:reference-views status:planned gain:URL test params fix time and camera (T-034) so the agent and Playwright screenshot exact views instead of describing them; Playwright MCP for ad-hoc looks
- [ ] O-010 test:deterministic-budgets status:planned gain:renderer.info draw calls, triangles and texture memory as CI budgets (T-073) instead of flaky fps numbers
- [ ] O-011 tool:public-repo status:needs-user gain:GitHub Actions minutes are free for public repositories; the private Escapement repo is blocked by billing (its D-002)
- [ ] O-012 tool:context7-mcp status:optional gain:current three.js / R3F / drei API docs on demand instead of guessing changed APIs (sends library names only); user decides
