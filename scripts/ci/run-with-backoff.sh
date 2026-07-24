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
command=("$@")

# CI installs use committed dependency intent. The repository-level release-age
# gate protects dependency selection, but it must not reject packages that are
# already reviewed and recorded in bun.lock. Explicit caller overrides still
# take precedence, and global tools retain the age gate because they are not
# lockfile-backed.
if [ "${command[0]:-}" = "bun" ] && [ "${command[1]:-}" = "install" ]; then
  has_minimum_release_age=false
  is_global_install=false

  for argument in "${command[@]}"; do
    if [[ "$argument" == --minimum-release-age* ]]; then
      has_minimum_release_age=true
    fi

    if [ "$argument" = "--global" ] || [ "$argument" = "-g" ]; then
      is_global_install=true
    fi
  done

  if [ "$has_minimum_release_age" = false ] && [ "$is_global_install" = false ]; then
    command+=("--minimum-release-age=0")
  fi
fi

while [ "$attempt" -le "$max_attempts" ]; do
  echo "Running command, attempt ${attempt}/${max_attempts}: ${command[*]}"

  if "${command[@]}"; then
    exit 0
  else
    status="$?"
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "Command failed after ${max_attempts} attempts with exit code ${status}: ${command[*]}" >&2
    exit "$status"
  fi

  if [ "${command[0]:-}" = "bun" ]; then
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
