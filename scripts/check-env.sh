#!/usr/bin/env bash
# Report what the Vastness development environment has. Read-only.
# Exit 0 when the required tools (node 20+, npm, git, node_modules once package.json exists) are present, 1 otherwise.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
missing=0

ok()   { printf 'ok    %-10s %s\n' "$1" "$2"; }
warn() { printf 'warn  %-10s %s\n' "$1" "$2"; }
fail() { printf 'FAIL  %-10s %s\n' "$1" "$2"; missing=1; }
have() { command -v "$1" >/dev/null 2>&1; }

if have node && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
  ok node "node $(node --version)"
else
  fail node "Node 20 or newer not found (O-001): nvm install 22"
fi
if have npm; then ok npm "npm $(npm --version)"; else fail npm "npm not found"; fi
if have git; then ok git "$(git --version)"; else fail git "not found"; fi
if have gh && gh auth status >/dev/null 2>&1; then ok gh "logged in"; else warn gh "not logged in (nightly, Pages checks): gh auth login"; fi

if [ -f "$root/package.json" ]; then
  if [ -d "$root/node_modules" ]; then
    ok deps "node_modules present"
    for t in vitest tsc prettier; do
      if [ -x "$root/node_modules/.bin/$t" ]; then ok "$t" "$("$root/node_modules/.bin/$t" --version 2>&1 | head -n 1)"; else fail "$t" "missing: npm ci"; fi
    done
    pw_rev="$(cd "$root" && node -e 'const p=require("@playwright/test").chromium.executablePath();const m=/chromium-(\d+)/.exec(p);process.stdout.write(require("fs").existsSync(p)&&m?m[1]:"")' 2>/dev/null || true)"
    if [ -n "$pw_rev" ]; then ok playwright "chromium $pw_rev installed"; else warn playwright "no browsers (O-007, e2e only): npx playwright install chromium"; fi
  else
    fail deps "node_modules missing: npm ci"
  fi
else
  warn deps "no package.json yet (T-001 creates it)"
fi

if have gh && gh auth status >/dev/null 2>&1; then
  ci="$(cd "$root" && timeout 20 gh run list --workflow ci.yml --branch main --limit 1 --json status,conclusion,headSha --jq '.[0] | "\(.status) \(.conclusion) \(.headSha[0:7])"' 2>/dev/null || true)"
  case "$ci" in
    "completed success "*) ok ci "last run on main: ${ci#completed }" ;;
    "") warn ci "no CI run found (T-006)" ;;
    *) warn ci "last run on main: $ci" ;;
  esac
fi
if [ -d "$root/.cache/horizons" ]; then ok cache "$(find "$root/.cache/horizons" -type f | wc -l) cached Horizons responses"; else warn cache "no Horizons cache yet (T-016)"; fi
if [ -f "$root/public/ephem/manifest.json" ]; then ok ephem "manifest present"; else warn ephem "no generated ephemerides yet (T-020)"; fi

exit $missing
