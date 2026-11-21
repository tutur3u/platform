#!/usr/bin/env bash
# Builds one apps/web vinext family Worker in a disposable checkout:
#
#   apps/web/cloudflare/vinext/build-family.sh <family>
#
# vinext needs React 19.3.1 or later while the monorepo pins React for every
# Next.js app, so the React upgrade, route pruning and Worker build happen only
# in a checkout marked disposable. Output: apps/web/.cloudflare/output plus
# apps/web/cloudflare/vinext/<family>.check.json (Redis-free and size gate).
set -euo pipefail

family="${1:?usage: build-family.sh <family>}"
app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
repo_dir="$(cd "$app_dir/../.." && pwd)"
marker="$app_dir/.opennext-disposable-checkout"
react_version="19.3.1"

if [[ "$(cat "$marker" 2>/dev/null)" != "disposable checkout for an OpenNext family build" ]]; then
  echo "Refusing to build: $marker is missing. Family builds run only in a disposable checkout." >&2
  exit 1
fi

cd "$repo_dir"
npm pkg set "overrides.react=$react_version" "overrides.react-dom=$react_version"
bun add -d "react@$react_version" "react-dom@$react_version"
(cd "$app_dir" && bun add -d "react-server-dom-webpack@$react_version")
bun install
bun x --no-install turbo run build --filter='@tuturuuu/web^...' --concurrency=4

cd "$app_dir"
bun cloudflare/vinext/prune.ts "$family" --apply
WEB_VINEXT_FAMILY="$family" node --max-old-space-size=32768 \
  node_modules/vite-plus/bin/vp build --config vite.vinext.config.ts --configLoader runner
WEB_VINEXT_FAMILY="$family" node_modules/.bin/cf deploy --dry-run --prebuilt \
  | tee "cloudflare/vinext/$family.dry-run.log"
node "$repo_dir/scripts/ci/web-vinext-bundle-check.mjs" \
  .cloudflare/output/v1/workers/default/bundle \
  --log "cloudflare/vinext/$family.dry-run.log" \
  | tee "cloudflare/vinext/$family.check.json"
