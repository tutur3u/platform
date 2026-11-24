#!/usr/bin/env bash
# Raises the chat-realtime staging stop fence (CHAT_REALTIME_STOPPED=true) and
# waits, bounded, until /health reports stopped. Idempotent; a Worker that was
# never created has nothing to fence. Needs CLOUDFLARE_ACCOUNT_ID,
# CLOUDFLARE_API_TOKEN and WORKER; CHAT_REALTIME_SMOKE_ORIGIN when known.
set -euo pipefail

[[ "${WORKER:-}" == tuturuuu-chat-realtime-staging ]]
[[ "${CLOUDFLARE_ACCOUNT_ID:-}" =~ ^[a-f0-9]{32}$ ]]
test -n "${CLOUDFLARE_API_TOKEN:-}"

api="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$WORKER"
status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 30 \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$api/settings" || true)"
if [[ "$status" == 404 ]]; then
  echo "no staging Worker to fence"
  exit 0
fi

curl --fail --silent --show-error --max-time 30 -X PUT \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"CHAT_REALTIME_STOPPED","text":"true","type":"secret_text"}' \
  "$api/secrets" | jq -e '.success == true' > /dev/null
echo "stop fence set"

if [[ -z "${CHAT_REALTIME_SMOKE_ORIGIN:-}" ]]; then
  echo "origin unknown; fence set without a health readback"
  exit 0
fi
for attempt in 1 2 3 4 5 6; do
  stopped="$(curl --silent --max-time 10 "$CHAT_REALTIME_SMOKE_ORIGIN/health" | jq -r '.stopped // empty' || true)"
  if [[ "$stopped" == true ]]; then
    echo "health reports stopped"
    exit 0
  fi
  sleep $((attempt * 5))
done
echo "health did not report stopped" >&2
exit 1
