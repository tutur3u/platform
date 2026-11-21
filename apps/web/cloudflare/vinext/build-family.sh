#!/usr/bin/env bash
# Builds one apps/web vinext family Worker in a disposable checkout:
#
#   apps/web/cloudflare/vinext/build-family.sh <family>
#
# vinext needs React 19.3.1 or later while the monorepo pins React for every
# Next.js app, so the React upgrade, route pruning and Worker build happen only
# in a checkout marked disposable. Output: apps/web/.cloudflare/output plus
# apps/web/cloudflare/vinext/<family>.check.json (patched react-server-dom-webpack,
# Redis-free and size gate).
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

# The build loads TypeScript config and prune scripts through Node's type
# stripping, which needs Node 24.22 or later. .node-version pins the repo's Node.
node_version="$(node -p 'process.versions.node')"
if ! node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  process.exit(major > 24 || (major === 24 && minor >= 22) ? 0 : 1);
'; then
  echo "Refusing to build: Node $node_version cannot strip TypeScript. Use Node $(cat "$repo_dir/.node-version" 2>/dev/null || echo '>= 24.22') (.node-version)." >&2
  exit 1
fi

# Vite+ resolves tsconfig.json upward past the checkout root, so a checkout
# nested in another checkout (such as .worktrees/) picks up the outer
# tsconfig.json. Build from a directory outside any other checkout.
parent_dir="$(dirname "$repo_dir")"
while [[ "$parent_dir" != "/" ]]; do
  if [[ -f "$parent_dir/tsconfig.json" ]]; then
    echo "Refusing to build: $repo_dir is nested under $parent_dir/tsconfig.json. Create the checkout outside any other checkout, for example ~/.t3/scratch/vinext-$family." >&2
    exit 1
  fi
  parent_dir="$(dirname "$parent_dir")"
done

cd "$repo_dir"
npm pkg set "overrides.react=$react_version" "overrides.react-dom=$react_version"
bun add -d "react@$react_version" "react-dom@$react_version"
(cd "$app_dir" && bun add -d "react-server-dom-webpack@$react_version")
bun install
# Refuse a vulnerable react-server-dom-webpack (GHSA-xqc2-xf4c-x3h3) before building.
node "$repo_dir/scripts/ci/web-vinext-bundle-check.mjs" --rsdw "$app_dir"
bun x --no-install turbo run build --filter='@tuturuuu/web^...' --concurrency=4

cd "$app_dir"
bun cloudflare/vinext/prune.ts "$family" --apply
WEB_VINEXT_FAMILY="$family" node --max-old-space-size=32768 \
  node_modules/vite-plus/bin/vp build --config vite.vinext.config.ts --configLoader runner
# cf prints the upload size on stderr; the bundle check reads it from the log.
WEB_VINEXT_FAMILY="$family" node_modules/.bin/cf deploy --dry-run --prebuilt 2>&1 \
  | tee "cloudflare/vinext/$family.dry-run.log"
node "$repo_dir/scripts/ci/web-vinext-bundle-check.mjs" \
  .cloudflare/output/v1/workers/default/bundle \
  --app "$app_dir" \
  --log "cloudflare/vinext/$family.dry-run.log" \
  | tee "cloudflare/vinext/$family.check.json"
