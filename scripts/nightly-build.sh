#!/usr/bin/env bash
# Builds everything the nightly pre-release carries into OUT (default nightly/), from what the checkout has
# at this point of the plan (T-008, VN-DOC-005, VN-GEN-010):
#
#   always             vastness-<ver>-docs.zip   README, LICENSE, NOTICE, docs/ (the current specs)
#                      build.json                version and commit (also inside every zip)
#   package.json       npm ci, typecheck, tests, build (a failure fails the nightly)
#   dist/index.html    vastness-<ver>-web.zip    the static app with LICENSE, NOTICE and third-party notices
#                      THIRD_PARTY_NOTICES.txt   licences of the bundled packages (also inside the web zip)
#                      SHA256SUMS                of every file above
#
#   scripts/nightly-build.sh [OUT]
#
# Deterministic: the same commit gives byte-identical files (sorted zip entries, file times set to the commit
# time, no extra attributes). VASTNESS_NIGHTLY_FAST=1 skips npm ci, typecheck and the unit tests (used by
# tests/nightly-build.test.ts, which is itself one of them). Used by .github/workflows/nightly.yml; runs
# locally too. Writes only into OUT and the build outputs (dist/, node_modules/), all gitignored.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/nightly}"
rm -rf "$out"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
cd "$root"

commit="$(git rev-parse --short=12 HEAD)"
ver="$(git describe --tags --exclude nightly --always)-nightly"
built="$(git log -1 --format=%cI HEAD)" # commit time, not wall time: same commit, same bytes
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

printf '{"commit":"%s","commit_time":"%s","name":"vastness","version":"%s"}\n' "$commit" "$built" "$ver" >"$out/build.json"

# Deterministic zip of a directory: sorted entries, fixed times, no extra attributes or directory entries.
zipdir() { # zipdir SRC_DIR ZIP_PATH
  (cd "$1" && find . -type f | LC_ALL=C sort | sed 's|^\./||' >"$stage/list" \
    && TZ=UTC find . -exec touch -h -d "$built" {} + \
    && zip -X -q -D "$2" -@ <"$stage/list")
}

echo "nightly-build: $ver ($commit)"

# Specs: always.
docs="$stage/docs/vastness-$ver-docs"
mkdir -p "$docs"
cp -R README.md LICENSE NOTICE docs "$docs/"
cp "$out/build.json" "$docs/"
zipdir "$stage/docs" "$out/vastness-$ver-docs.zip"

if [ -f package.json ]; then
  if [ "${VASTNESS_NIGHTLY_FAST:-}" != 1 ]; then
    npm ci --no-audit --no-fund
    npm run check-deps
    npm run typecheck
    npm test
  fi
  npm run build >"$stage/build.log" 2>&1 || { cat "$stage/build.log" >&2; exit 1; }
  if [ -f dist/index.html ]; then
    web="$stage/web/vastness-$ver-web"
    mkdir -p "$web"
    cp -R dist/. "$web/"
    cp "$out/build.json" "$web/"
    for f in LICENSE NOTICE THIRD_PARTY_NOTICES.txt; do
      [ -f "$web/$f" ] || { echo "nightly-build: the build did not ship $f (VN-GEN-007)" >&2; exit 1; }
    done
    zipdir "$stage/web" "$out/vastness-$ver-web.zip"
  fi
  if [ -f THIRD_PARTY_NOTICES.txt ]; then cp THIRD_PARTY_NOTICES.txt "$out/"; fi
fi

(cd "$out" && export LC_ALL=C && sha256sum -- * >SHA256SUMS)
echo "nightly-build: published files:"
(cd "$out" && ls -1)
