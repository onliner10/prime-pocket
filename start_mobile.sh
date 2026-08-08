#!/usr/bin/env bash
# Start the Prime Pocket Expo mobile client.
#
# Usage:
#   ./start_mobile.sh           # expo start
#   ./start_mobile.sh --ios
#   ./start_mobile.sh --android
#   ./start_mobile.sh --web
#   ./start_mobile.sh --clear    # clear Metro cache, then start
#
# Extra args after -- are passed to expo start.

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

# Mobile imports @prime-pocket/protocol; build it if missing.
if [[ ! -f packages/protocol/dist/index.js ]]; then
  echo "→ building protocol…"
  pnpm --filter @prime-pocket/protocol build
fi

SCRIPT="start"
EXPO_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ios)
      SCRIPT="ios"
      shift
      ;;
    --android)
      SCRIPT="android"
      shift
      ;;
    --web)
      SCRIPT="web"
      shift
      ;;
    --clear)
      EXPO_ARGS+=(--clear)
      shift
      ;;
    --)
      shift
      EXPO_ARGS+=("$@")
      break
      ;;
    *)
      EXPO_ARGS+=("$1")
      shift
      ;;
  esac
done

echo "→ starting Expo (pnpm --filter @prime-pocket/mobile ${SCRIPT})…"
if [[ ${#EXPO_ARGS[@]} -gt 0 ]]; then
  exec pnpm --filter @prime-pocket/mobile "${SCRIPT}" -- "${EXPO_ARGS[@]}"
else
  exec pnpm --filter @prime-pocket/mobile "${SCRIPT}"
fi
