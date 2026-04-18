#!/bin/sh
set -eu

LOCKFILE_PATH="/workspace/bun.lock"
NODE_MODULES_PATH="/workspace/node_modules"
LOCK_HASH_PATH="${NODE_MODULES_PATH}/.bun-lock-hash"

mkdir -p "${NODE_MODULES_PATH}"

if [ ! -f "${LOCKFILE_PATH}" ]; then
  echo "Missing bun.lock at ${LOCKFILE_PATH}" >&2
  exit 1
fi

current_hash="$(sha256sum "${LOCKFILE_PATH}" | awk '{ print $1 }')"
stored_hash=""

if [ -f "${LOCK_HASH_PATH}" ]; then
  stored_hash="$(cat "${LOCK_HASH_PATH}")"
fi

if [ ! -d "${NODE_MODULES_PATH}/.bun" ] || [ "${stored_hash}" != "${current_hash}" ]; then
  echo "Installing Bun dependencies for the Docker web workspace..."
  bun install --frozen-lockfile
  printf '%s' "${current_hash}" > "${LOCK_HASH_PATH}"
fi

exec "$@"
