#!/bin/bash
set -euo pipefail

if [[ "${PLATFORM_NAME:-}" != "iphoneos" ]]; then
  exit 0
fi

frameworks_dir="${TARGET_BUILD_DIR}/${WRAPPER_NAME}/Frameworks"
native_asset_cache="${SRCROOT}/../.dart_tool/hooks_runner/shared"

if [[ ! -d "${frameworks_dir}" || ! -d "${native_asset_cache}" ]]; then
  exit 0
fi

framework_platform() {
  xcrun vtool -show-build "$1" 2>/dev/null | awk '/platform / { print $2; exit }'
}

find_ios_replacement() {
  local framework_name="$1"
  local candidate

  while IFS= read -r -d '' candidate; do
    if [[ "$(framework_platform "${candidate}")" == "IOS" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done < <(find "${native_asset_cache}" -path "*/build/*/${framework_name}.dylib" -print0 2>/dev/null)

  return 1
}

resign_framework_if_needed() {
  local framework_dir="$1"

  if [[ "${CODE_SIGNING_ALLOWED:-NO}" != "YES" || -z "${EXPANDED_CODE_SIGN_IDENTITY:-}" ]]; then
    return 0
  fi

  codesign --force --sign "${EXPANDED_CODE_SIGN_IDENTITY}" --preserve-metadata=identifier,entitlements,flags --timestamp=none "${framework_dir}"
}

while IFS= read -r -d '' framework_dir; do
  framework_name="$(basename "${framework_dir}" .framework)"
  framework_binary="${framework_dir}/${framework_name}"

  if [[ ! -f "${framework_binary}" ]]; then
    continue
  fi

  platform="$(framework_platform "${framework_binary}")"
  if [[ "${platform}" != "IOSSIMULATOR" ]]; then
    continue
  fi

  replacement_binary="$(find_ios_replacement "${framework_name}" || true)"
  if [[ -z "${replacement_binary}" ]]; then
    echo "error: ${framework_name}.framework is built for the simulator, and no iOS native-asset replacement was found." >&2
    exit 1
  fi

  echo "Replacing simulator native asset ${framework_name}.framework with ${replacement_binary}"
  chmod +w "${framework_binary}"
  ditto "${replacement_binary}" "${framework_binary}"

  if [[ "$(framework_platform "${framework_binary}")" != "IOS" ]]; then
    echo "error: Failed to repair ${framework_name}.framework for device builds." >&2
    exit 1
  fi

  resign_framework_if_needed "${framework_dir}"
done < <(find "${frameworks_dir}" -maxdepth 1 -type d -name '*.framework' -print0)
