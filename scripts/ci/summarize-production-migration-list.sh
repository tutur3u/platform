#!/usr/bin/env bash
# Summarize `supabase migration list --linked` from stdin against a local
# migrations directory. Remote versions are column 2. CLI v2.121.0 wraps
# every cell in backticks, and an absent cell is a backtick, a space, and
# a backtick. A parsed remote list exits 0, including when versions are pending.
set -euo pipefail

migrations_dir="${1:?migrations directory required}"
listing="$(cat)"

versions() { sed -n 's/^\([0-9][0-9]*\)_.*\.sql$/\1/p' | sort -u; }
nonblank() { printf '%s\n' "$1" | sed '/^$/d'; }
count() { printf '%s\n' "$1" | sed '/^$/d' | wc -l | tr -d ' '; }

local_versions="$(ls "$migrations_dir" | versions)"
remote_versions="$(printf '%s\n' "$listing" |
  awk -F'|' 'NF >= 3 { gsub(/[[:space:]`]/, "", $2); if ($2 ~ /^[0-9]+$/) print $2 }' | sort -u)"

[ -n "$remote_versions" ] || {
  echo "::error::Production migration list returned no remote versions."
  exit 1
}
[ -n "$local_versions" ] || {
  echo "::error::Main migration catalog is empty."
  exit 1
}

pending="$(comm -23 <(nonblank "$local_versions") <(nonblank "$remote_versions"))"
remote_only="$(comm -13 <(nonblank "$local_versions") <(nonblank "$remote_versions"))"
cutoff=20261112133000
local_le="$(nonblank "$local_versions" | awk -v c="$cutoff" '$1 <= c')"
missing_le="$(comm -23 <(nonblank "$local_le") <(nonblank "$remote_versions"))"
remote_max="$(nonblank "$remote_versions" | tail -1)"
local_max="$(nonblank "$local_versions" | tail -1)"
{
  echo "catalog_sha=${GITHUB_SHA:-unknown}"
  echo "local_max=$local_max"
  echo "remote_max=$remote_max"
  echo "local_versions_at_or_below_${cutoff}=$(count "$local_le")"
  echo "missing_at_or_below_${cutoff}=$(count "$missing_le")"
  echo "pending_count=$(count "$pending")"
  echo "remote_only_count=$(count "$remote_only")"
  echo "MISSING_AT_OR_BELOW_${cutoff}_BEGIN"
  printf '%s\n' "$missing_le"
  echo "MISSING_AT_OR_BELOW_${cutoff}_END"
  echo "PENDING_BEGIN"
  printf '%s\n' "$pending"
  echo "PENDING_END"
  echo "REMOTE_ONLY_BEGIN"
  printf '%s\n' "$remote_only"
  echo "REMOTE_ONLY_END"
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
