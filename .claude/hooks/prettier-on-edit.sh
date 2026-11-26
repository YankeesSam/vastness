#!/usr/bin/env bash
# PostToolUse hook (Write / Edit / MultiEdit): prettier the .ts/.tsx/.mts/.css/.json file Claude just changed.
# Silent for other files, missing files, files outside the project, or when prettier is not in node_modules.
# If prettier cannot parse the file, the error goes back to Claude (exit 2) so it fixes the syntax.
f=$(python3 -c '
import json, sys
d = json.load(sys.stdin)
r = d.get("tool_response")
i = d.get("tool_input") or {}
print((r.get("filePath") if isinstance(r, dict) else None) or i.get("file_path") or "")
' 2>/dev/null) || exit 0
case "$f" in *.ts|*.tsx|*.mts|*.css|*.json) ;; *) exit 0 ;; esac
[ -f "$f" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-.}"
case "$f" in "$root"/*) ;; /*) exit 0 ;; esac
case "$f" in */node_modules/*|*/public/ephem/*|*/testdata/*|*package-lock.json) exit 0 ;; esac
prettier="$root/node_modules/.bin/prettier"
[ -x "$prettier" ] || exit 0
if ! out=$("$prettier" --write --log-level warn "$f" 2>&1); then
  printf 'prettier could not format %s:\n%s\n' "$f" "$out" >&2
  exit 2
fi
exit 0
