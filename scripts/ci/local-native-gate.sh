#!/usr/bin/env bash
# Run the native artifact gate (config, seal, verify, emitted-config receipt) on a
# LOCAL build of the exact checked-out commit, the same four checks CI runs in
# native-start-app.yaml. Read-only on the tree: it writes only into a private temp dir.
#
# Why this exists: native-emitted-config-receipt.mjs requires
# realpath(RUNNER_TEMP) == RUNNER_TEMP. On macOS, mktemp/$TMPDIR live under the
# /var -> /private/var symlink, so a hand-run receipt reports `unavailable` even
# though nothing is wrong with the build. This helper creates its temp dir under a
# canonical (symlink-free) path, so the receipt and seal behave exactly as in CI.
#
# Usage (from the repository root, after `bun run build:cloudflare` in the app):
#   scripts/ci/local-native-gate.sh <app> <artifact-script> <source-sha-env> [--profile <name>] [--out <dir>]
# Example:
#   scripts/ci/local-native-gate.sh marketing scripts/ci/marketing-native-artifact.py MARKETING_SOURCE_SHA
#   scripts/ci/local-native-gate.sh learn scripts/ci/learn-native-artifact.py LEARN_SOURCE_SHA --profile production
#
# Not covered: Meet (uses scripts/ci/verify-meet-start-output.js and an in-tree seal)
# and any app whose workflow rewrites dist/server/wrangler.json first. Run the
# workflow's own rewrite step verbatim before this helper; never retype it.
set -euo pipefail

usage() {
  echo "usage: $0 <app> <artifact-script> <source-sha-env> [--profile <name>] [--out <dir>]" >&2
  exit 2
}

[ "$#" -ge 3 ] || usage
app=$1
script=$2
sha_env=$3
shift 3
profile=""
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile) [ "$#" -ge 2 ] || usage; profile=$2; shift 2 ;;
    --out) [ "$#" -ge 2 ] || usage; out=$2; shift 2 ;;
    *) usage ;;
  esac
done

case "$app" in *[!a-z0-9-]* | "") echo "invalid app name" >&2; exit 2 ;; esac
case "$sha_env" in *[!A-Z0-9_]* | "") echo "invalid source sha variable name" >&2; exit 2 ;; esac
[ -f "$script" ] || { echo "artifact script not found: $script" >&2; exit 2; }
[ -d "apps/$app/dist" ] || { echo "apps/$app/dist missing: build the app first" >&2; exit 2; }

root=$(pwd -P)
sha=$(git rev-parse HEAD)
base=$(cd "${TMPDIR:-/tmp}" && pwd -P)
work=$(mktemp -d "$base/native-gate.XXXXXX")
trap 'rm -rf "$work"' EXIT
[ "$(cd "$work" && pwd -P)" = "$work" ] || { echo "temp dir is not canonical: $work" >&2; exit 1; }

export GITHUB_OUTPUT="$work/github-output"
export RUNNER_TEMP="$work"
export "$sha_env=$sha"
: >"$GITHUB_OUTPUT"

py=(python3 -I "$script")
if [ -n "$profile" ]; then py+=(--profile "$profile"); fi

echo "gate $app @ ${sha:0:12} (temp $work)"
"${py[@]}" config "apps/$app"
echo "config ok"
"${py[@]}" seal "apps/$app" --receipt "$work/artifact-receipt.json"
echo "seal ok"
"${py[@]}" verify "apps/$app" --receipt "$work/artifact-receipt.json"
echo "verify ok"
node scripts/ci/native-emitted-config-receipt.mjs "apps/$app" "$sha" "$work/emitted-config-receipt.json"

if [ -n "$out" ]; then
  mkdir -p "$out"
  cp "$work/artifact-receipt.json" "$work/emitted-config-receipt.json" "$out/"
  echo "receipts copied to $out"
fi
cd "$root"
