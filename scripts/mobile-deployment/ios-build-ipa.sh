#!/usr/bin/env bash
# Build and export the production TestFlight IPA.
#
# Usage: ios-build-ipa.sh <manual|cloud> <build-name> <build-number>
#        (run from apps/mobile after ios-signing.sh)
#
# Both modes leave the archive at build/ios/archive/Runner.xcarchive and the
# IPA under build/ios/ipa, which the verification and symbol steps read.
set -euo pipefail

mode="${1:?signing mode}"
build_name="${2:?build name}"
build_number="${3:?build number}"

flutter_args=(
  --release
  --flavor production
  --target lib/main_production.dart
  --dart-define-from-file=.env.github
  --dart-define=IOS_LIVE_SCREEN_BROADCAST_ENABLED=false
  "--build-name=${build_name}"
  "--build-number=${build_number}"
)

case "$mode" in
  manual)
    flutter build ipa "${flutter_args[@]}" --export-options-plist=ios/ExportOptions.plist
    ;;
  cloud)
    : "${APP_STORE_CONNECT_API_KEY_ID:?}" "${APP_STORE_CONNECT_ISSUER_ID:?}"
    : "${APP_STORE_CONNECT_PRIVATE_KEY_PATH:?}"
    # flutter build ipa cannot pass App Store Connect authentication to
    # xcodebuild, so generate the Flutter configuration and drive Xcode here.
    flutter build ios "${flutter_args[@]}" --config-only
    auth_args=(
      -allowProvisioningUpdates
      -authenticationKeyPath "$APP_STORE_CONNECT_PRIVATE_KEY_PATH"
      -authenticationKeyID "$APP_STORE_CONNECT_API_KEY_ID"
      -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID"
    )
    archive_path=build/ios/archive/Runner.xcarchive
    rm -rf "$archive_path" build/ios/ipa
    xcodebuild \
      -workspace ios/Runner.xcworkspace \
      -scheme production \
      -configuration Release-production \
      -destination generic/platform=iOS \
      -archivePath "$archive_path" \
      "${auth_args[@]}" \
      COMPILER_INDEX_STORE_ENABLE=NO \
      archive
    xcodebuild \
      -exportArchive \
      -archivePath "$archive_path" \
      -exportPath build/ios/ipa \
      -exportOptionsPlist ios/ExportOptions.plist \
      "${auth_args[@]}"
    ;;
  *)
    echo "::error title=Unknown iOS signing mode::Use manual or cloud." >&2
    exit 1
    ;;
esac
