#!/usr/bin/env bash
# Run a command with an owned, disposable Redis for Web unit suites
# (scripts/ci/disposable-redis.js requires an explicit local endpoint off CI).
# Uses redis-server on a private Unix socket when installed, otherwise the
# digest-pinned image through Docker on a loopback port. Always removed on exit.
set -euo pipefail

image='docker.io/library/redis@sha256:7f7d30b7fdd09467bac58198a1f166dd69789d348d4fe859cccb20e0cf287fbe'
scratch=$(mktemp -d "${TMPDIR:-/tmp}/fleet-ci-redis.XXXXXX")
container=''
pid=''

cleanup() {
  if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi
  if [ -n "$container" ]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi
  rm -rf "$scratch"
}
trap cleanup EXIT INT TERM

if command -v redis-server >/dev/null 2>&1; then
  redis-server --port 0 --unixsocket "$scratch/redis.sock" --unixsocketperm 700 \
    --save '' --appendonly no --maxmemory 16mb --maxmemory-policy noeviction \
    --dir "$scratch" >"$scratch/redis.log" 2>&1 &
  pid=$!
  for _ in $(seq 1 50); do [ -S "$scratch/redis.sock" ] && break; sleep 0.1; done
  export LIVE_MINT_TEST_REDIS_DISPOSABLE=1 LIVE_MINT_TEST_REDIS_SOCKET="$scratch/redis.sock"
elif docker info >/dev/null 2>&1; then
  container="fleet-ci-redis-$$-$RANDOM"
  docker run -d --rm --name "$container" --memory 64m --cpus 0.5 --pids-limit 64 \
    --cap-drop ALL --security-opt no-new-privileges --read-only --user 999:999 \
    --publish 127.0.0.1::6379 "$image" redis-server --save '' --appendonly no \
    --maxmemory 16mb --maxmemory-policy noeviction --protected-mode no >/dev/null
  port=$(docker port "$container" 6379/tcp | head -1 | sed 's/.*://')
  export LIVE_MINT_TEST_REDIS_DISPOSABLE=1 LIVE_MINT_TEST_REDIS_PORT="$port"
else
  echo 'fleet-ci: no redis-server or running Docker; Web suites that need Redis will fail.' >&2
fi

"$@"
