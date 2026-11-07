#!/usr/bin/env bash
# Runs `git push` to this repository with PUSH_TOKEN as an HTTP auth header
# delivered through git's environment config (GIT_CONFIG_COUNT/KEY/VALUE), so
# the token never appears in the argv of git, git-remote-https or any helper.
set -euo pipefail

: "${PUSH_TOKEN:?PUSH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

# printf is a shell builtin; base64 and tr only ever see the token on stdin.
auth="$(printf 'x-access-token:%s' "${PUSH_TOKEN}" | base64 | tr -d '\n')"
unset PUSH_TOKEN
if [ "${GITHUB_ACTIONS:-}" = true ]; then
  echo "::add-mask::${auth}"
fi

index="${GIT_CONFIG_COUNT:-0}"
export "GIT_CONFIG_KEY_${index}=http.https://github.com/.extraheader"
export "GIT_CONFIG_VALUE_${index}=AUTHORIZATION: basic ${auth}"
export GIT_CONFIG_COUNT=$((index + 1))
unset auth

exec git push "https://github.com/${GITHUB_REPOSITORY}.git" "$@"
