#!/usr/bin/env bash
set -euo pipefail

# Flutter opens Secret Service at startup. Give this smoke run its own keyring
# and session bus so an existing runner login cannot supply the credentials.
sandbox=$(mktemp -d)

# Teardown keeps the wrapped command's exit status. xdg-document-portal mounts
# FUSE at $XDG_RUNTIME_DIR/doc while the session bus lives, so detach it before
# removing the sandbox. A teardown failure is reported, never turned into a
# failed smoke step.
cleanup() {
  local status=$?
  trap - EXIT
  local portal="${XDG_RUNTIME_DIR:-}/doc"
  if [[ -n "${XDG_RUNTIME_DIR:-}" ]] &&
    command -v mountpoint >/dev/null 2>&1 && mountpoint -q "$portal"; then
    { command -v fusermount3 >/dev/null 2>&1 &&
      fusermount3 -uz -- "$portal"; } ||
      { command -v fusermount >/dev/null 2>&1 &&
        fusermount -uz -- "$portal"; } ||
      echo "warning: could not unmount $portal" >&2
  fi
  if ! rm -rf -- "$sandbox"; then
    echo "warning: could not remove the smoke sandbox; the smoke result is unchanged" >&2
  fi
  exit "$status"
}
trap cleanup EXIT
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
