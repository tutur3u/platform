#!/usr/bin/env bash
set -euo pipefail
df -h /
docker system prune -af --volumes || true
docker builder prune -af || true
sudo rm -rf \
  /usr/share/dotnet \
  /usr/local/lib/android \
  /usr/local/share/boost \
  /usr/share/swift \
  /opt/az \
  /opt/ghc \
  /opt/google \
  /opt/hostedtoolcache/CodeQL || true
df -h /
