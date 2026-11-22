#!/bin/sh
# Builds mm-secret-hpke as a universal macOS 14 binary, runs the CryptoKit
# self-test, and writes the binary's SHA-256 next to it. Run on a macOS 14 or
# later build host with the Xcode command line tools, never on the
# orchestrator Mac. Install by copying mm-secret-hpke and mm-secret-hpke.sha256
# into ~/.local/share/fleet-sync/bin/ on each fleet Mac.
#   scripts/mastermind-fleet/secret-hpke/build.sh [output-dir]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
core="$root/apps/mobile/ios/Runner/MastermindSecretCrypto.swift"
out="${1:-$here/build}"
mkdir -p "$out"

for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos14.0" -o "$out/mm-secret-hpke-$arch" \
    "$core" "$here/main.swift"
done
lipo -create -output "$out/mm-secret-hpke" \
  "$out/mm-secret-hpke-arm64" "$out/mm-secret-hpke-x86_64"
rm "$out/mm-secret-hpke-arm64" "$out/mm-secret-hpke-x86_64"

swiftc -O -parse-as-library -target "$(uname -m)-apple-macos14.0" \
  -o "$out/mm-secret-hpke-selftest" "$core" "$here/selftest.swift"
# Test-only phone stand-in for secret-request.e2e.test.mjs; never installed.
swiftc -O -parse-as-library -target "$(uname -m)-apple-macos14.0" \
  -o "$out/mm-secret-seal-test" "$core" "$here/seal-tool.swift"
"$out/mm-secret-hpke-selftest" "$root/scripts/mastermind-fleet/secret-fixture.json"
# The phone's Keychain store against a stand-in Keychain; never installed.
swiftc -O -parse-as-library -target "$(uname -m)-apple-macos14.0" \
  -o "$out/mm-secret-store-selftest" \
  "$root/apps/mobile/ios/Runner/MastermindSecretStore.swift" "$here/store-selftest.swift"
"$out/mm-secret-store-selftest"
"$out/mm-secret-hpke" version

shasum -a 256 "$out/mm-secret-hpke" | awk '{print $1}' >"$out/mm-secret-hpke.sha256"
echo "built $out/mm-secret-hpke ($(cat "$out/mm-secret-hpke.sha256"))"
