#!/usr/bin/env bash
set -euo pipefail

# Flutter opens Secret Service at startup. Give this smoke run its own keyring
# and session bus so an existing runner login cannot supply the credentials.
sandbox=$(mktemp -d)
trap 'rm -rf -- "$sandbox"' EXIT
export HOME="$sandbox"
export XDG_CONFIG_HOME="$sandbox/config"
export XDG_DATA_HOME="$sandbox/data"
export XDG_CACHE_HOME="$sandbox/cache"
export XDG_RUNTIME_DIR="$sandbox/runtime"
mkdir -m 700 "$XDG_RUNTIME_DIR"

dbus-run-session -- bash -euo pipefail -c '
  printf "%s" desktop-smoke-keyring |
    timeout 15s gnome-keyring-daemon --unlock --components=secrets >/dev/null

  # Prove libsecret can open the collection without a desktop unlock prompt.
  printf "%s" desktop-smoke-probe |
    timeout 15s secret-tool store --label="Desktop smoke probe" tuturuuu-smoke probe
  test "$(timeout 15s secret-tool lookup tuturuuu-smoke probe)" = desktop-smoke-probe
  timeout 15s secret-tool clear tuturuuu-smoke probe
  exec "$@"
' desktop-secret-service "$@"
