#!/usr/bin/env bash
# Prepare iOS distribution signing for the TestFlight upload job.
#
# Usage: ios-signing.sh <manual|cloud>   (run from apps/mobile)
#
# manual: import the vault distribution identity and App Store profile into a
#         temporary keychain and sign with them explicitly.
# cloud:  let Xcode manage signing through the vault App Store Connect API key
#         (-allowProvisioningUpdates). Xcode creates or refreshes the App Store
#         profile and App ID capabilities and signs the export with a
#         cloud-managed Apple Distribution certificate. The key needs the Admin
#         role for cloud-managed distribution certificates.
#
# Both modes write ios/Flutter/StoreSigning.xcconfig and ios/ExportOptions.plist
# and export MOBILE_TIME_SENSITIVE_ENTITLEMENT for the exported-app check.
set -euo pipefail

mode="${1:-manual}"
time_sensitive_key='com.apple.developer.usernotifications.time-sensitive'
plist_buddy="${PLIST_BUDDY:-/usr/libexec/PlistBuddy}"

: "${APPLE_TEAM_ID:?}" "${APPLE_BUNDLE_ID:?}" "${GITHUB_ENV:?}" "${RUNNER_TEMP:?}"
# The team id is written into the xcconfig and export plist, so only accept
# the Apple format (ten uppercase letters or digits).
if ! [[ "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "::error title=Apple signing configuration::APPLE_TEAM_ID is not a ten-character Apple team id."
  exit 1
fi

write_export_options() {
  local signing_style="$1" profile_uuid="${2:-}" watch_uuid="${3:-}" watch_widgets_uuid="${4:-}" profiles=''
  if [ -n "$profile_uuid" ]; then
    local watch_entries=''
    if [ -n "$watch_uuid" ] && [ -n "$watch_widgets_uuid" ]; then
      watch_entries="
    <key>${APPLE_BUNDLE_ID}.watchkitapp</key>
    <string>${watch_uuid}</string>
    <key>${APPLE_BUNDLE_ID}.watchkitapp.widgets</key>
    <string>${watch_widgets_uuid}</string>"
    fi
    profiles="  <key>provisioningProfiles</key>
  <dict>
    <key>${APPLE_BUNDLE_ID}</key>
    <string>${profile_uuid}</string>${watch_entries}
  </dict>"
  fi
  cat > ios/ExportOptions.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>signingStyle</key>
  <string>${signing_style}</string>
  <key>teamID</key>
  <string>${APPLE_TEAM_ID}</string>
${profiles}
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
EOF
}

case "$mode" in
  cloud)
    : "${APP_STORE_CONNECT_API_KEY_ID:?}" "${APP_STORE_CONNECT_ISSUER_ID:?}"
    : "${APP_STORE_CONNECT_PRIVATE_KEY_PATH:?}"
    test -s "$APP_STORE_CONNECT_PRIVATE_KEY_PATH"
    cat > ios/Flutter/StoreSigning.xcconfig <<EOF
CODE_SIGN_STYLE = Automatic
DEVELOPMENT_TEAM = ${APPLE_TEAM_ID}
EOF
    write_export_options automatic
    # Xcode adds the capability to the App ID while it manages signing.
    echo "MOBILE_TIME_SENSITIVE_ENTITLEMENT=true" >> "$GITHUB_ENV"
    echo "MOBILE_WATCH_EMBEDDED=true" >> "$GITHUB_ENV"
    echo "Prepared Xcode-managed (cloud) distribution signing."
    ;;
  manual)
    : "${APPLE_DISTRIBUTION_CERTIFICATE_P12_PATH:?}" "${APPLE_PROVISIONING_PROFILE_PATH:?}"
    keychain_path="$RUNNER_TEMP/mobile-deployment/mobile-deployment.keychain-db"
    keychain_password="$(openssl rand -hex 32)"
    echo "::add-mask::$keychain_password"
    security create-keychain -p "$keychain_password" "$keychain_path"
    security set-keychain-settings -lut 21600 "$keychain_path"
    security unlock-keychain -p "$keychain_password" "$keychain_path"
    if ! security import "$APPLE_DISTRIBUTION_CERTIFICATE_P12_PATH" \
      -P "${APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD:-}" \
      -T /usr/bin/codesign \
      -T /usr/bin/security \
      -t cert \
      -f pkcs12 \
      -k "$keychain_path" >/dev/null 2>&1; then
      echo "::error title=Apple signing import failed::Could not import the distribution identity."
      exit 1
    fi
    security list-keychains -d user -s "$keychain_path" login.keychain-db
    # security prints private-key record attributes even without verbose mode.
    # Keep both normal and failure output out of public Actions logs.
    if ! security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain_path" >/dev/null 2>&1; then
      echo "::error title=Apple signing access failed::Could not grant codesign access to the distribution identity."
      exit 1
    fi

    profile_plist="$RUNNER_TEMP/mobile-deployment/profile.plist"
    security cms -D -i "$APPLE_PROVISIONING_PROFILE_PATH" > "$profile_plist"
    APPLE_LIVE_SCREEN_GROUP_REQUIRED=true swift ../../scripts/mobile-deployment/verify-profile.swift "$profile_plist"
    # Time Sensitive Notifications is optional for beta delivery: a profile
    # without it must not stop TestFlight while Android keeps shipping. Omit
    # the entitlement so manual signing matches the profile; iOS then delivers
    # urgent and decision alerts at the active level.
    if [ "$("$plist_buddy" -c "Print Entitlements:${time_sensitive_key}" "$profile_plist" 2>/dev/null || true)" = true ]; then
      time_sensitive_entitlement=true
    else
      time_sensitive_entitlement=false
      "$plist_buddy" -c "Delete :${time_sensitive_key}" ios/Runner/Runner-Production.entitlements
      echo "::warning title=Time Sensitive Notifications omitted::The App Store profile lacks Time Sensitive Notifications. This TestFlight build delivers urgent and decision alerts at the active level. Enable the capability on the production App ID, regenerate the App Store profile and replace it in the Mobile Deployment vault, or switch IOS_SIGNING_MODE to cloud, to restore it."
      if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
        echo "- iOS Time Sensitive Notifications omitted: the App Store profile lacks the capability." >> "$GITHUB_STEP_SUMMARY"
      fi
    fi
    echo "MOBILE_TIME_SENSITIVE_ENTITLEMENT=$time_sensitive_entitlement" >> "$GITHUB_ENV"

    profile_uuid="$("$plist_buddy" -c 'Print UUID' "$profile_plist")"
    profile_team="$("$plist_buddy" -c 'Print TeamIdentifier:0' "$profile_plist")"
    app_identifier="$("$plist_buddy" -c 'Print Entitlements:application-identifier' "$profile_plist")"
    test "$APPLE_TEAM_ID" = "$profile_team"
    test "$app_identifier" = "$APPLE_TEAM_ID.$APPLE_BUNDLE_ID"
    mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
    cp "$APPLE_PROVISIONING_PROFILE_PATH" "$HOME/Library/MobileDevice/Provisioning Profiles/${profile_uuid}.mobileprovision"
    echo "MOBILE_PROFILE_UUID=$profile_uuid" >> "$GITHUB_ENV"

    watch_profile_uuid=''
    watch_widgets_profile_uuid=''
    if [ "${APPLE_WATCH_PROFILES_READY:-false}" = true ] \
      && [ -n "${APPLE_WATCH_PROVISIONING_PROFILE_PATH:-}" ] \
      && [ -n "${APPLE_WATCH_WIDGETS_PROVISIONING_PROFILE_PATH:-}" ]; then
      watch_plist="$RUNNER_TEMP/mobile-deployment/watch-profile.plist"
      watch_widgets_plist="$RUNNER_TEMP/mobile-deployment/watch-widgets-profile.plist"
      security cms -D -i "$APPLE_WATCH_PROVISIONING_PROFILE_PATH" > "$watch_plist"
      APPLE_PROFILE_KIND=watch swift ../../scripts/mobile-deployment/verify-profile.swift "$watch_plist"
      security cms -D -i "$APPLE_WATCH_WIDGETS_PROVISIONING_PROFILE_PATH" > "$watch_widgets_plist"
      APPLE_PROFILE_KIND=watch-widgets swift ../../scripts/mobile-deployment/verify-profile.swift "$watch_widgets_plist"
      watch_profile_uuid="$("$plist_buddy" -c 'Print UUID' "$watch_plist")"
      watch_widgets_profile_uuid="$("$plist_buddy" -c 'Print UUID' "$watch_widgets_plist")"
      cp "$APPLE_WATCH_PROVISIONING_PROFILE_PATH" "$HOME/Library/MobileDevice/Provisioning Profiles/${watch_profile_uuid}.mobileprovision"
      cp "$APPLE_WATCH_WIDGETS_PROVISIONING_PROFILE_PATH" "$HOME/Library/MobileDevice/Provisioning Profiles/${watch_widgets_profile_uuid}.mobileprovision"
      echo "MOBILE_WATCH_PROFILE_UUID=$watch_profile_uuid" >> "$GITHUB_ENV"
      echo "MOBILE_WATCH_WIDGETS_PROFILE_UUID=$watch_widgets_profile_uuid" >> "$GITHUB_ENV"
      echo "MOBILE_WATCH_EMBEDDED=true" >> "$GITHUB_ENV"
    else
      echo "MOBILE_WATCH_EMBEDDED=false" >> "$GITHUB_ENV"
      echo "::warning title=Apple Watch companion omitted::Manual signing mode has no Watch app or Watch Widgets App Store provisioning profiles in the Mobile Deployment vault. Shipping iOS without TuturuuuWatch. Upload apple_watch_app_store_provisioning_profile and apple_watch_widgets_app_store_provisioning_profile or switch IOS_SIGNING_MODE to cloud to embed the Watch app."
      if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
        echo "- Apple Watch companion omitted: manual signing vault lacks Watch app and Widgets App Store profiles." >> "$GITHUB_STEP_SUMMARY"
      fi
    fi

    cat > ios/Flutter/StoreSigning.xcconfig <<EOF
CODE_SIGN_STYLE = Manual
CODE_SIGN_IDENTITY[sdk=iphoneos*] = Apple Distribution
CODE_SIGN_IDENTITY[sdk=watchos*] = Apple Distribution
DEVELOPMENT_TEAM = ${APPLE_TEAM_ID}
PROVISIONING_PROFILE_SPECIFIER = ${profile_uuid}
WATCH_APP_PROFILE_UUID = ${watch_profile_uuid}
WATCH_WIDGETS_PROFILE_UUID = ${watch_widgets_profile_uuid}
EOF
    write_export_options manual "$profile_uuid" "$watch_profile_uuid" "$watch_widgets_profile_uuid"
    ;;
  *)
    echo "::error title=Unknown iOS signing mode::Use manual or cloud." >&2
    exit 1
    ;;
esac
