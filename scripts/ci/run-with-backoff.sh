#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 64
fi

max_attempts="${CI_RETRY_MAX_ATTEMPTS:-4}"
delay="${CI_RETRY_INITIAL_DELAY_SECONDS:-5}"
max_delay="${CI_RETRY_MAX_DELAY_SECONDS:-60}"
attempt=1

while [ "$attempt" -le "$max_attempts" ]; do
  echo "Running command, attempt ${attempt}/${max_attempts}: $*"

  if "$@"; then
    exit 0
  fi

  status="$?"

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "Command failed after ${max_attempts} attempts with exit code ${status}: $*" >&2
    exit "$status"
  fi

  if [ "${1:-}" = "bun" ]; then
    echo "Clearing Bun install cache before retry..." >&2
    bun pm cache rm || true
  fi

  echo "Command failed with exit code ${status}; retrying in ${delay}s..." >&2
  sleep "$delay"

  attempt=$((attempt + 1))
  delay=$((delay * 2))
  if [ "$delay" -gt "$max_delay" ]; then
    delay="$max_delay"
  fi
done
