#!/usr/bin/env bash
# Start the Prime Pocket bridge (local API server).
#
# Usage:
#   ./start_server.sh                 # demo mode over HTTP (easiest for LAN)
#   ./start_server.sh --tls           # demo mode with self-signed TLS
#   ./start_server.sh --live          # real Prime daemon (no --demo)
#   ./start_server.sh -- --ntfy-topic my-topic   # extra bridge CLI args
#
# Env:
#   SKIP_BUILD=1   skip protocol/bridge build even if dist is missing

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm is required (https://pnpm.io/installation)" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "→ installing dependencies…"
  pnpm install
fi

MODE="demo-http"
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tls)
      MODE="demo-tls"
      shift
      ;;
    --live)
      MODE="live"
      shift
      ;;
    --http)
      MODE="demo-http"
      shift
      ;;
    --)
      shift
      EXTRA+=("$@")
      break
      ;;
    *)
      EXTRA+=("$1")
      shift
      ;;
  esac
done

need_build=0
if [[ ! -f packages/protocol/dist/index.js ]]; then
  need_build=1
fi
if [[ ! -f packages/bridge/dist/cli.js ]]; then
  need_build=1
fi

if [[ "${SKIP_BUILD:-0}" != "1" && "$need_build" -eq 1 ]]; then
  echo "→ building protocol + bridge…"
  pnpm --filter @prime-pocket/protocol build
  pnpm --filter @prime-pocket/bridge build
fi

BRIDGE_ARGS=(bridge)
case "$MODE" in
  demo-http)
    BRIDGE_ARGS+=(--demo --http)
    echo "→ starting bridge (demo, HTTP)…"
    ;;
  demo-tls)
    BRIDGE_ARGS+=(--demo)
    echo "→ starting bridge (demo, TLS)…"
    ;;
  live)
    echo "→ starting bridge (live daemon)…"
    ;;
esac

if [[ ${#EXTRA[@]} -gt 0 ]]; then
  BRIDGE_ARGS+=("${EXTRA[@]}")
fi

exec pnpm --filter @prime-pocket/bridge exec node dist/cli.js "${BRIDGE_ARGS[@]}"
