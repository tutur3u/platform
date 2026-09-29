#!/usr/bin/env bash
set -euo pipefail

archive="${1:?Pass the Runner xcarchive path}"
plist="${2:?Pass the production GoogleService-Info.plist path}"
uploader="${3:?Pass the FirebaseCrashlytics upload-symbols path}"
app="$archive/Products/Applications/Runner.app/Runner"
symbols="$archive/dSYMs/Runner.app.dSYM"

for path in "$app" "$symbols" "$plist" "$uploader"; do
  if [[ ! -e "$path" ]]; then
    echo "Missing iOS Crashlytics symbol input: $path" >&2
    exit 1
  fi
done

uuid_for() {
  xcrun dwarfdump --uuid "$1" | awk '$2 ~ /^[0-9A-Fa-f-]+$/ && $3 == "(arm64)" { print toupper($2); exit }'
}

app_uuid="$(uuid_for "$app")"
symbol_uuid="$(uuid_for "$symbols")"
if [[ -z "$app_uuid" || "$app_uuid" != "$symbol_uuid" ]]; then
  echo "Runner arm64 dSYM UUID does not match the archived app" >&2
  exit 1
fi

echo "Uploading archived iOS dSYMs for Runner UUID $app_uuid"
"$uploader" -gsp "$plist" -p ios "$archive/dSYMs"
