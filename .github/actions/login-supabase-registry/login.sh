#!/usr/bin/env bash
set -euo pipefail
# Never expose credentials or registry diagnostics, including rejected tokens.
if [[ -z "${GHCR_TOKEN:-}" || -z "${GHCR_USERNAME:-}" ]]; then
  echo "GHCR credentials unavailable; using anonymous public image pulls."
elif printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USERNAME" --password-stdin >/dev/null 2>&1; then
  echo "GHCR authentication configured."
else
  echo "::warning::GHCR authentication unavailable; using anonymous public image pulls."
fi
