#!/bin/sh
# Runs the phone's Keychain store self-test against a real iOS Keychain. It
# builds store-selftest.swift as a minimal simulator app with a Keychain
# access group of its own, installs it on a booted simulator, prints the
# result and removes the app. It works in a new directory of its own, made
# under [parent-dir] (default: the system temporary directory) and removed
# afterwards. Needs Xcode with an iOS 17 or later simulator runtime; build.sh
# covers the same store against a stand-in Keychain.
#   scripts/mastermind-fleet/secret-hpke/store-selftest-ios.sh <booted-device-udid> [parent-dir]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
udid=${1:?usage: store-selftest-ios.sh <booted-device-udid> [parent-dir]}
parent=${2:-${TMPDIR:-/tmp}}
work=$(mktemp -d "${parent%/}/store-selftest.XXXXXX")
trap 'rm -rf "$work"' EXIT
id=com.tuturuuu.secretstore.selftest
app="$work/StoreSelfTest.app"
mkdir "$app"

cat >"$work/entitlements.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>application-identifier</key><string>SELFTEST00.$id</string>
<key>keychain-access-groups</key><array><string>SELFTEST00.$id</string></array>
</dict></plist>
PLIST
cat >"$app/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>$id</string>
<key>CFBundleExecutable</key><string>StoreSelfTest</string>
<key>CFBundleName</key><string>StoreSelfTest</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>MinimumOSVersion</key><string>17.0</string>
<key>LSRequiresIPhoneOS</key><true/>
<key>UIDeviceFamily</key><array><integer>1</integer></array>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
</dict></plist>
PLIST

# A simulator build carries its entitlements in a Mach-O section.
xcrun -sdk iphonesimulator swiftc -O -parse-as-library \
  -target "$(uname -m)-apple-ios17.0-simulator" \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __entitlements \
  -Xlinker "$work/entitlements.plist" \
  -o "$app/StoreSelfTest" \
  "$root/apps/mobile/ios/Runner/MastermindSecretStore.swift" "$here/store-selftest.swift"
codesign -s - -f "$app" >/dev/null 2>&1

xcrun simctl install "$udid" "$app"
out=$(xcrun simctl launch --console-pty "$udid" "$id" 2>&1 | tr -d '\r') || true
xcrun simctl uninstall "$udid" "$id" >/dev/null 2>&1 || true
printf '%s\n' "$out"
# Pass only when the device Keychain was really used and nothing failed.
printf '%s\n' "$out" | grep -q '^store selftest: real Keychain exercised$'
printf '%s\n' "$out" | grep -q '^store selftest: [0-9][0-9]* passed$'
