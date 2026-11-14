#!/usr/bin/env bash
# Remove emitted server source maps and their sourceMappingURL references.
#
# Their original sources keep development-only branches the bundle drops, so a
# sealed Worker must not ship them. The reference comments go too: Wrangler
# resolves every sourceMappingURL when it bundles the Worker, and a reference
# to a deleted map fails the dry run and the deploy.
#
# Usage: scripts/ci/strip-server-source-maps.sh <dist/server directory>
set -euo pipefail

server=${1:?usage: $0 <dist/server directory>}
[ -d "$server" ] || { echo "not a directory: $server" >&2; exit 2; }

reference='^//# sourceMappingURL=[^[:space:]]+\.map[[:space:]]*$'
find "$server" -type f -name '*.map' -delete
find "$server" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) \
  -exec sed -i.strip-bak -E "\\|${reference}|d" {} +
find "$server" -type f -name '*.strip-bak' -delete

if find "$server" -type f -name '*.map' | grep -q .; then
  echo "server source maps remain under $server" >&2
  exit 1
fi
if grep -rlE --include='*.js' --include='*.mjs' --include='*.cjs' \
  "$reference" "$server"; then
  echo "server sourceMappingURL references remain under $server" >&2
  exit 1
fi
