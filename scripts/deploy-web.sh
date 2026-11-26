#!/usr/bin/env bash
# Dev only: build the static app and serve it to the local network, so the current HEAD can be
# opened from another machine. The handoff runs it at the end of every session (vastness-handoff
# step 7).
#   scripts/deploy-web.sh             build, (re)start, check, print the URLs
#   scripts/deploy-web.sh --no-build  restart on the last build
#   scripts/deploy-web.sh --stop      stop it
#   scripts/deploy-web.sh --status    print the URLs if it is running
# VASTNESS_WEB_PORT (8770) is the port on every interface. The served copy, the log and the pid
# live in ${XDG_STATE_HOME:-~/.local/state}/vastness-web, so a later `npm run build` never
# changes what is being served. The app is static (no server API, ADR-0005): the
# server is Python's http.server over that copy. Reaching it from the LAN under
# WSL needs a one-time Windows step: docs/TESTBED.md, "Web app on the LAN".
set -euo pipefail
cd "$(dirname "$0")/.."

port="${VASTNESS_WEB_PORT:-8770}"
state="${XDG_STATE_HOME:-$HOME/.local/state}/vastness-web"
mkdir -p "$state"

stop() {
  if [[ -f "$state/server.pid" ]]; then
    pid="$(cat "$state/server.pid")"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 50); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
    rm -f "$state/server.pid"
  fi
}

running() {
  [[ -f "$state/server.pid" ]] && kill -0 "$(cat "$state/server.pid")" 2>/dev/null
}

windows_ips() {
  command -v powershell.exe >/dev/null || return 0
  timeout 15 powershell.exe -NoProfile -Command \
    "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.InterfaceAlias -notlike 'vEthernet*' -and \$_.IPAddress -notlike '127.*' -and \$_.IPAddress -notlike '169.254.*' } | ForEach-Object { \$_.IPAddress }" \
    2>/dev/null | tr -d '\r' || true
}

# HTTP status of `url` as Windows sees it (000 when unreachable); empty outside WSL.
windows_probe() {
  command -v powershell.exe >/dev/null || return 0
  timeout 15 powershell.exe -NoProfile -Command \
    "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 '$1').StatusCode } catch { '000' }" \
    2>/dev/null | tr -d '\r' || echo 000
}

report() {
  wsl_ip="$(ip -4 -o addr show eth0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1)"
  local_code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/" || true)"
  {
    echo "build:   $(cat "$state/build.txt" 2>/dev/null || echo unknown)"
    echo "local:   http://127.0.0.1:${port}/  (${local_code})"
    [[ -n "$wsl_ip" ]] && echo "wsl:     http://${wsl_ip}:${port}/"
    if command -v powershell.exe >/dev/null; then
      echo "windows: http://localhost:${port}/  ($(windows_probe "http://localhost:${port}/"))"
      for ip in $(windows_ips); do echo "lan:     http://${ip}:${port}/  ($(windows_probe "http://${ip}:${port}/"))"; done
    fi
  } | tee "$state/urls.txt"
}

case "${1:-}" in
  --stop) stop; echo "stopped"; exit 0 ;;
  --status)
    if running; then report; else echo "not running"; exit 1; fi
    exit 0 ;;
esac

if [[ "${1:-}" != "--no-build" ]]; then
  [[ -d node_modules ]] || npm ci --no-audit --no-fund
  npm run build >"$state/build.log" 2>&1 || { tail -20 "$state/build.log"; exit 1; }
fi
[[ -f dist/index.html ]] || { echo "no dist/index.html: run without --no-build" >&2; exit 1; }

stop
rm -rf "$state/site"
mkdir -p "$state/site"
(cd dist && tar -cf - .) | (cd "$state/site" && tar -xf -)
echo "$(git describe --tags --exclude nightly --always) $(git rev-parse --short=12 HEAD)" >"$state/build.txt"

: >"$state/server.log"
setsid nohup python3 -m http.server "$port" --bind 0.0.0.0 --directory "$state/site" \
  >"$state/server.log" 2>&1 </dev/null &
echo $! >"$state/server.pid"
for _ in $(seq 50); do
  curl -sf -o /dev/null "http://127.0.0.1:${port}/" && break
  kill -0 "$(cat "$state/server.pid")" 2>/dev/null || break
  sleep 0.1
done
if ! curl -sf -o /dev/null "http://127.0.0.1:${port}/"; then
  echo "the server did not start:" >&2
  cat "$state/server.log" >&2
  stop
  exit 1
fi
report
