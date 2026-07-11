#!/usr/bin/env bash
set -euo pipefail

version="${1:-1.3.14}"
max_attempts="${BUN_SETUP_MAX_ATTEMPTS:-6}"
delay="${BUN_SETUP_INITIAL_DELAY_SECONDS:-5}"
max_delay="${BUN_SETUP_MAX_DELAY_SECONDS:-60}"
bun_install="${BUN_INSTALL:-$HOME/.bun}"
bin_dir="${bun_install}/bin"

case "$(uname -s)" in
  Linux) os="linux" ;;
  Darwin) os="darwin" ;;
  *)
    echo "Unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) arch="x64" ;;
  arm64 | aarch64) arch="aarch64" ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

target="bun-${os}-${arch}"
url="https://github.com/oven-sh/bun/releases/download/bun-v${version}/${target}.zip"

publish_bun_environment() {
  if [ -n "${GITHUB_PATH:-}" ]; then
    echo "$bin_dir" >> "$GITHUB_PATH"
  fi

  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "BUN_INSTALL=$bun_install" >> "$GITHUB_ENV"
  fi

  export PATH="${bin_dir}:${PATH}"
  "${bin_dir}/bun" --revision
}

if [ -x "${bin_dir}/bun" ]; then
  installed_version="$("${bin_dir}/bun" --version 2>/dev/null || true)"
  if [ "$installed_version" = "$version" ]; then
    echo "Using cached Bun ${version} from ${bin_dir}/bun."
    publish_bun_environment
    exit 0
  fi

  echo "Ignoring cached Bun ${installed_version:-unknown}; expected ${version}."
  rm -f "${bin_dir}/bun"
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  echo "Downloading Bun ${version}, attempt ${attempt}/${max_attempts}: ${url}"

  if curl --fail --location --silent --show-error \
    --connect-timeout 15 \
    --max-time 180 \
    --output "${tmp_dir}/bun.zip" \
    "$url"; then
    rm -rf "${tmp_dir:?}/${target}"
    unzip -o -q "${tmp_dir}/bun.zip" -d "$tmp_dir"
    mkdir -p "$bin_dir"
    cp "${tmp_dir}/${target}/bun" "${bin_dir}/bun"
    chmod +x "${bin_dir}/bun"
    publish_bun_environment
    exit 0
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "Failed to download Bun ${version} after ${max_attempts} attempts." >&2
    exit 1
  fi

  echo "Bun download failed; retrying in ${delay}s..." >&2
  sleep "$delay"

  attempt=$((attempt + 1))
  delay=$((delay * 2))
  if [ "$delay" -gt "$max_delay" ]; then
    delay="$max_delay"
  fi
done
