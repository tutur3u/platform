#!/usr/bin/env bash
# Runs the apps/mobile native unit test suites from a clean checkout:
#   - iOS:     RunnerTests via xcodebuild (scheme `development`, simulator destination)
#   - Android: JVM unit tests via the flavored Gradle task
#
# Usage: scripts/mobile-native-tests.sh [ios|android|all]   (default: all)
# Env:   IOS_SIMULATOR_ID  simulator UDID to use (default: first available iPhone)
#
# Requires Flutter on PATH; iOS needs Xcode + CocoaPods; Android needs the SDK/JDK.
# No signing, sign-in or network service beyond dependency downloads is used.
# Note: `pod install` may reorder ios/Runner.xcodeproj/project.pbxproj and touch
# ios/Podfile.lock; do not commit that churn.
set -euo pipefail

TARGET="${1:-all}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
FLAVOR_TARGET="lib/main_development.dart"

cd "$MOBILE"
echo "==> flutter pub get"
flutter pub get

run_ios() {
  if [ "$(uname -s)" != "Darwin" ]; then
    echo "==> skipping iOS (not macOS)"
    return 0
  fi
  # The Runner target bundles ios/Runner/GoogleService-Info.plist (gitignored).
  # Use the tracked development config; never a production one.
  if [ ! -f ios/Runner/GoogleService-Info.plist ]; then
    echo "==> copying GoogleService-Info-development.plist -> GoogleService-Info.plist"
    cp ios/Runner/GoogleService-Info-development.plist ios/Runner/GoogleService-Info.plist
  fi

  # Regenerates ios/Flutter/Generated.xcconfig with the development entrypoint
  # (the default lib/main.dart does not exist) and installs pods.
  echo "==> flutter build ios --config-only (development flavor)"
  flutter build ios --config-only --simulator --debug \
    --flavor development --target "$FLAVOR_TARGET"
  # CocoaPods needs a UTF-8 locale (non-interactive shells often lack one).
  (cd ios && LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}" pod install)

  local sim="${IOS_SIMULATOR_ID:-}"
  if [ -z "$sim" ]; then
    sim="$(xcrun simctl list devices available \
      | grep -E '^\s+iPhone' | head -n1 | grep -oE '[0-9A-F-]{36}')"
  fi
  [ -n "$sim" ] || { echo "error: no available iPhone simulator" >&2; exit 1; }
  echo "==> iOS RunnerTests on simulator $sim"
  local booted_by_us=0
  if ! xcrun simctl list devices | grep "$sim" | grep -q Booted; then
    booted_by_us=1
  fi
  local rc=0
  xcodebuild test \
    -workspace ios/Runner.xcworkspace \
    -scheme development \
    -configuration Debug-development \
    -destination "id=$sim" \
    -only-testing:RunnerTests \
    CODE_SIGNING_ALLOWED=NO || rc=$?
  if [ "$booted_by_us" = 1 ]; then
    xcrun simctl shutdown "$sim" >/dev/null 2>&1 || true
  fi
  return "$rc"
}

run_android() {
  cd "$MOBILE/android"
  if [ ! -x ./gradlew ]; then
    # gradlew is gitignored; Flutter generates it.
    echo "==> generating Gradle wrapper via flutter"
    (cd "$MOBILE" && flutter build apk --config-only --flavor development \
      --target "$FLAVOR_TARGET") || true
  fi
  echo "==> Android unit tests (:app:testDevelopmentDebugUnitTest)"
  # The Flutter bundle step is skipped: unit tests do not need the Dart build.
  ./gradlew :app:testDevelopmentDebugUnitTest \
    -x :app:compileFlutterBuildDevelopmentDebug
}

case "$TARGET" in
  ios) run_ios ;;
  android) run_android ;;
  all) run_ios; run_android ;;
  *) echo "usage: $0 [ios|android|all]" >&2; exit 2 ;;
esac
echo "==> mobile native tests OK ($TARGET)"
