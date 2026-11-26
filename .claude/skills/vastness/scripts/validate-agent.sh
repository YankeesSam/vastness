#!/usr/bin/env bash
# Validate agent control-plane files against schema v1. Token-cheap drift guard.
set -euo pipefail
ROOT="${1:-.}"
AGENT="$ROOT/agent"
err=0
need() { [[ -f "$AGENT/$1" ]] || { echo "MISSING $1"; err=1; }; }
need STATE.md; need HANDOFF.md; need PLAN.md; need DEFECTS.md
need WORKINGLIST.md; need OPTIMIZATIONS.md; need CONTEXT.md
if [[ -f "$AGENT/STATE.md" ]]; then
  grep -q '^schema: 1$' "$AGENT/STATE.md" || { echo "STATE schema"; err=1; }
  grep -q '^project: vastness$' "$AGENT/STATE.md" || { echo "STATE project"; err=1; }
  grep -q '^status: \(ready\|running\|blocked\|done\)$' "$AGENT/STATE.md" || { echo "STATE status"; err=1; }
  grep -q '^milestone: M[0-9]$' "$AGENT/STATE.md" || { echo "STATE milestone"; err=1; }
  grep -q '^phase: [0-9]$' "$AGENT/STATE.md" || { echo "STATE phase"; err=1; }
fi
if [[ -f "$AGENT/HANDOFF.md" ]]; then
  grep -q '^schema: 1$' "$AGENT/HANDOFF.md" || { echo "HANDOFF schema"; err=1; }
  grep -q '^next_task_id: ' "$AGENT/HANDOFF.md" || { echo "HANDOFF next_task_id"; err=1; }
  n=$(awk '/^read_next:/{f=1;next} /^[a-z_]+:/{f=0} f && /^  - /{c++} END{print c+0}' "$AGENT/HANDOFF.md")
  [[ "$n" -le 8 ]] || { echo "HANDOFF read_next lists more than 8 paths"; err=1; }
fi
if [[ -f "$AGENT/PLAN.md" ]]; then
  for h in Now Next Later Done; do
    grep -q "^## $h\$" "$AGENT/PLAN.md" || { echo "PLAN heading $h"; err=1; }
  done
  nows=$(grep -c '^- \[ \] NOW ' "$AGENT/PLAN.md" || true)
  [[ "$nows" -le 1 ]] || { echo "PLAN multiple NOW"; err=1; }
  dups=$(grep -oE '^- \[[ x]\] (NOW )?T-[0-9]{3}' "$AGENT/PLAN.md" | grep -oE 'T-[0-9]{3}' | sort | uniq -d || true)
  [[ -z "$dups" ]] || { echo "PLAN duplicate task IDs: $dups"; err=1; }
  bad=$(grep -E '^- \[ \] (NOW )?T-[0-9]{3}' "$AGENT/PLAN.md" | grep -vE ' P[012] @phase[0-9] ' | grep -oE 'T-[0-9]{3}' || true)
  [[ -z "$bad" ]] || { echo "PLAN task lines missing P-level or @phase: $bad"; err=1; }
  bad=$(grep -E '^- \[ \] (NOW )?T-[0-9]{3}' "$AGENT/PLAN.md" | grep -vE '  req: .*  files: .*  test: ' | grep -oE 'T-[0-9]{3}' || true)
  [[ -z "$bad" ]] || { echo "PLAN task lines missing req/files/test: $bad"; err=1; }
fi
if [[ -f "$AGENT/CONTEXT.md" ]]; then
  n=$(grep -c '^- ' "$AGENT/CONTEXT.md" || true)
  [[ "$n" -le 8 ]] || { echo "CONTEXT lists more than 8 files"; err=1; }
fi
if [[ -f "$ROOT/docs/REQUIREMENTS.md" && -f "$AGENT/PLAN.md" ]]; then
  missing=$(grep -oE 'VN-[A-Z]{2,3}-[0-9]{3}' "$AGENT/PLAN.md" | sort -u | while read -r id; do
    grep -q "\*\*$id\*\*" "$ROOT/docs/REQUIREMENTS.md" || echo "$id"; done)
  [[ -z "$missing" ]] || { echo "PLAN cites requirements not in docs/REQUIREMENTS.md: $(echo $missing)"; err=1; }
fi
[[ $err -eq 0 ]] && echo "agent files ok"
exit $err
