#!/usr/bin/env bash
# Publishes the nightly pre-release at the end of a session and proves it worked (vastness-handoff step 6,
# VN-DOC-005). The push of the session's last commit starts .github/workflows/nightly.yml; this waits for the
# run at HEAD (and starts one by workflow_dispatch if none appears), then downloads what was published and
# checks it: the nightly tag is HEAD, the release is a pre-release, every file matches SHA256SUMS, build.json
# names HEAD, and the web zip carries the app with LICENSE, NOTICE and the third-party notices.
#
#   scripts/nightly.sh
#
# Exit 0 published and checked, 1 the run or a check failed, 2 it could not start (gh not logged in, HEAD not
# pushed to main). NIGHTLY_POLL_S (default 5) is the wait between looks for the run.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "nightly.sh: $*" >&2; exit 1; }
stop() { echo "nightly.sh: $*" >&2; exit 2; }

command -v gh >/dev/null || stop "gh is not installed"
gh auth status >/dev/null 2>&1 || stop "gh is not logged in; run gh auth login"

head=$(git rev-parse HEAD)
short=${head:0:12}
main=$(gh api 'repos/{owner}/{repo}/commits/main' --jq .sha) || stop "cannot read main on GitHub"
[ "$head" = "$main" ] || stop "HEAD $short is not main on GitHub (${main:0:12}); push first"

# The newest Nightly run for HEAD that has not been cancelled (a later push cancels earlier runs).
run_for_head() {
  gh run list --workflow nightly.yml --commit "$head" --limit 10 --json databaseId,conclusion \
    --jq '[.[] | select(.conclusion != "cancelled")][0].databaseId // ""'
}

run=""
for _ in $(seq 18); do # about 90 s for the push-triggered run to appear
  run=$(run_for_head)
  [ -n "$run" ] && break
  sleep "${NIGHTLY_POLL_S:-5}"
done
if [ -z "$run" ]; then
  echo "nightly.sh: no run for $short after the push; starting one"
  gh workflow run nightly.yml --ref main >/dev/null || stop "cannot start the workflow"
  for _ in $(seq 24); do
    run=$(run_for_head)
    [ -n "$run" ] && break
    sleep "${NIGHTLY_POLL_S:-5}"
  done
fi
[ -n "$run" ] || fail "no Nightly run for $short appeared"
url=$(gh run view "$run" --json url --jq .url)
echo "nightly.sh: waiting for $url"
gh run watch "$run" --exit-status --interval 15 >/dev/null || fail "the run failed, or gh could not watch it: $url"

tag=$(gh api 'repos/{owner}/{repo}/git/ref/tags/nightly' --jq .object.sha) || fail "no nightly tag"
[ "$tag" = "$head" ] || fail "tag nightly is at ${tag:0:12}, not $short"
[ "$(gh release view nightly --json isPrerelease --jq .isPrerelease)" = true ] || fail "release nightly is not a pre-release"

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
gh release download nightly -D "$dir" || fail "cannot download the published files"
(cd "$dir" && sha256sum --quiet -c SHA256SUMS) || fail "the published files do not match SHA256SUMS"
listed=$(cut -d' ' -f3- "$dir/SHA256SUMS" | sed 's/^\*//' | sort)
present=$(cd "$dir" && ls -1 | grep -vx SHA256SUMS | sort)
[ "$listed" = "$present" ] || fail "SHA256SUMS does not list exactly the published files"
ls "$dir"/vastness-*-docs.zip >/dev/null 2>&1 || fail "no docs zip published"
commit=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"])' "$dir/build.json") || fail "no readable build.json"
[ "$commit" = "$short" ] || fail "build.json names $commit, not $short"
version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$dir/build.json")

web=$(ls "$dir"/vastness-*-web.zip 2>/dev/null | head -n 1 || true)
[ ! -f index.html ] || [ -n "$web" ] || fail "index.html exists but no web zip was published"
if [ -n "$web" ]; then
  entries=$(unzip -Z1 "$web")
  for f in index.html LICENSE NOTICE THIRD_PARTY_NOTICES.txt build.json; do
    grep -qx "vastness-$version-web/$f" <<<"$entries" || fail "the web zip has no $f"
  done
fi
[ ! -f THIRD_PARTY_NOTICES.txt ] || [ -f "$dir/THIRD_PARTY_NOTICES.txt" ] || fail "THIRD_PARTY_NOTICES.txt was not published"
echo "nightly.sh: ok: $version ($(cd "$dir" && ls -1 | grep -vx SHA256SUMS | tr '\n' ' '))"
