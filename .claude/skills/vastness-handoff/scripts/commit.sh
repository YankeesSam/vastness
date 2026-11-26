#!/usr/bin/env bash
# Best-effort commit. Push is decided by the skill after this succeeds.
# Usage: commit.sh "T-012: subject" ["extra trailer lines"]
set -euo pipefail
MSG="${1:-T-000: session handoff}"
TRAILER="${2:-}"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "NO_GIT"
  exit 0
fi
git add -A
if git diff --cached --quiet; then
  echo "NO_CHANGES"
  exit 0
fi
if [ -n "$TRAILER" ]; then
  git commit -q -m "$MSG" -m "$TRAILER"
else
  git commit -q -m "$MSG"
fi
git rev-parse --short HEAD
