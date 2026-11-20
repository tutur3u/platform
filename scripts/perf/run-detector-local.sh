#!/bin/sh
set +x
set -eu

detector="$(dirname "$0")/perf-regression-detector.mjs"
for arg in "$@"; do
  case "$arg" in
    --fixture|--fixture=*) exec node "$detector" "$@" ;;
  esac
done

read_keychain() {
  if value=$(/usr/bin/security find-generic-password -a fleet -s "com.tuturuuu.perf-factory.$1" -w 2>/dev/null) && [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf 'Missing or inaccessible Keychain service com.tuturuuu.perf-factory.%s\n' "$1" >&2
    exit 2
  fi
}

CLOUDFLARE_ACCOUNT_ID=$(read_keychain cloudflare-account) || exit 2
CLOUDFLARE_ZONE_ID=$(read_keychain cloudflare-zone) || exit 2
CLOUDFLARE_API_TOKEN=$(read_keychain cloudflare) || exit 2
export CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ZONE_ID CLOUDFLARE_API_TOKEN
exec node "$detector" "$@"
