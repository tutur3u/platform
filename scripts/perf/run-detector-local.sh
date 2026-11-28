#!/bin/sh
set +x
set -eu

# Runs the regression detector with Cloudflare credentials read from the macOS
# Keychain. A staged copy of scripts/perf must carry every module and data file
# the detector loads; otherwise fail loudly before running.
here="$(dirname "$0")"
resolved_here="$(cd "$here" 2>/dev/null && pwd -P || printf '%s' "$here")"
detector="$here/perf-regression-detector.mjs"
for needed in \
  perf-entry.mjs \
  perf-regression-detector.mjs \
  perf-regression-cloudflare.mjs \
  perf-regression-rules.mjs \
  perf-deploy-failures.mjs \
  perf-apps.json; do
  if [ ! -f "$here/$needed" ]; then
    printf 'DEGRADED: detector staging incomplete in %s, missing %s\n' \
      "$resolved_here" "$needed" >&2
    exit 2
  fi
done

out=""
fixture=0
prev=""
for arg in "$@"; do
  case "$prev" in
    --out) out="$arg" ;;
  esac
  case "$arg" in
    --out=*) out="${arg#--out=}" ;;
    --fixture|--fixture=*) fixture=1 ;;
  esac
  prev="$arg"
done

read_keychain() {
  if value=$(/usr/bin/security find-generic-password -a fleet -s "com.tuturuuu.perf-factory.$1" -w 2>/dev/null) && [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf 'Missing or inaccessible Keychain service com.tuturuuu.perf-factory.%s\n' "$1" >&2
    exit 2
  fi
}

if [ "$fixture" -eq 0 ]; then
  CLOUDFLARE_ACCOUNT_ID=$(read_keychain cloudflare-account) || exit 2
  CLOUDFLARE_ZONE_ID=$(read_keychain cloudflare-zone) || exit 2
  CLOUDFLARE_API_TOKEN=$(read_keychain cloudflare) || exit 2
  export CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ZONE_ID CLOUDFLARE_API_TOKEN
fi

# Do not `exec`: remove any stale --out file first, and fail loudly (exit 2)
# if the detector exits 0 without writing --out or with empty stdout.
status=0
if [ -n "$out" ]; then
  rm -f "$out"
  node "$detector" "$@" || status=$?
  if [ "$status" -ne 0 ]; then
    exit "$status"
  fi
  if [ ! -s "$out" ]; then
    printf 'DEGRADED: detector exited 0 without writing %s\n' "$out" >&2
    exit 2
  fi
else
  tmp_out=$(mktemp)
  trap 'rm -f "$tmp_out"' EXIT INT TERM
  node "$detector" "$@" > "$tmp_out" || status=$?
  if [ "$status" -ne 0 ]; then
    [ -s "$tmp_out" ] && cat "$tmp_out"
    exit "$status"
  fi
  if [ ! -s "$tmp_out" ]; then
    printf 'DEGRADED: detector exited 0 with empty stdout\n' >&2
    exit 2
  fi
  cat "$tmp_out"
fi
