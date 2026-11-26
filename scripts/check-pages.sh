#!/usr/bin/env bash
# Probes the GitHub Pages deploy (T-007, VN-WEB-001): the page answers 200, its build.json names the expected
# commit, and the legal files ship with it.
#   scripts/check-pages.sh                  expect HEAD (git rev-parse --short=12 HEAD)
#   scripts/check-pages.sh COMMIT           expect that commit
#   scripts/check-pages.sh --wait [COMMIT]  poll up to VASTNESS_PAGES_WAIT seconds (600) for the deploy
# VASTNESS_PAGES_URL overrides the site URL. Exit 0 when it matches, 1 otherwise.
set -euo pipefail
cd "$(dirname "$0")/.."

url="${VASTNESS_PAGES_URL:-https://yankeessam.github.io/vastness/}"
wait=0
if [ "${1:-}" = "--wait" ]; then
  wait=1
  shift
fi
want="${1:-$(git rev-parse --short=12 HEAD)}"
deadline=$((SECONDS + ${VASTNESS_PAGES_WAIT:-600}))

probe() {
  local status got
  status="$(curl -s -o /dev/null -w '%{http_code}' "$url")" || status=000
  if [ "$status" != 200 ]; then
    echo "pages: $url answered $status"
    return 1
  fi
  got="$(curl -fsS "${url}build.json" 2>/dev/null | sed -n 's/.*"commit":"\([0-9a-f]*\)".*/\1/p')" || got=""
  if [ "$got" != "$want" ]; then
    echo "pages: build.json commit is '${got:-none}', expected $want"
    return 1
  fi
  for f in LICENSE NOTICE THIRD_PARTY_NOTICES.txt; do
    status="$(curl -s -o /dev/null -w '%{http_code}' "$url$f")" || status=000
    if [ "$status" != 200 ]; then
      echo "pages: $url$f answered $status (VN-GEN-007)"
      return 1
    fi
  done
  echo "pages: ok $url at $want"
}

until probe; do
  if [ "$wait" != 1 ] || [ "$SECONDS" -ge "$deadline" ]; then exit 1; fi
  sleep 20
done
