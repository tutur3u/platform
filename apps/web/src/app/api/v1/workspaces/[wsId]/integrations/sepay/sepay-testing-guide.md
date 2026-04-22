# SePay Integration Testing Guide

This guide helps you validate the end-to-end SePay flow in the current backend implementation.

## 1) Prerequisites

- Local app is running (web API reachable).
- You have a workspace id (`wsId`) where SePay integration is enabled.
- Workspace feature flag secret is set:
  - `ENABLE_SEPAY_INTEGRATION=true`
- Required environment variables are configured for `apps/web`:
  - `SEPAY_OAUTH_CLIENT_ID`
  - `SEPAY_OAUTH_CLIENT_SECRET`
  - `SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET`
  - `SEPAY_WEBHOOK_API_KEY` (or `SEPAY_WEBHOOK_SECRET`)
  - `WEB_APP_URL` (or `NEXT_PUBLIC_WEB_APP_URL` / `NEXT_PUBLIC_APP_URL`)
- Required workspace configuration is present:
  - `workspace_secrets.ENABLE_SEPAY_INTEGRATION=true`
- Optional overrides (defaults are already set to SePay production docs values):
  - `SEPAY_OAUTH_AUTHORIZE_URL` (default: `https://my.sepay.vn/oauth/authorize`)
  - `SEPAY_OAUTH_BASE_URL` (default: `https://my.sepay.vn`)
  - `SEPAY_API_BASE_URL` (default: `https://my.sepay.vn/api/v1`)

## 2) Enable feature flag for workspace

Insert/update workspace secret for your target workspace:

```sql
insert into workspace_secrets (ws_id, name, value)
values ('<WS_ID>', 'ENABLE_SEPAY_INTEGRATION', 'true')
on conflict (ws_id, name)
do update set value = excluded.value;
```

## 3) OAuth connect flow

1. Start OAuth from the same browser session that will receive the callback.

Browser flow:

```text
Open /api/v1/workspaces/<WS_ID>/integrations/sepay/oauth/start in an authenticated browser session, then follow the returned authorizeUrl.
```

CLI flow with cookie jar:

```bash
curl -X POST \
  "http://localhost:7803/api/v1/workspaces/<WS_ID>/integrations/sepay/oauth/start" \
  -H "Authorization: Bearer <YOUR_APP_TOKEN>" \
  -c /tmp/sepay-oauth.cookies
```

2. Open `authorizeUrl` in the same browser session, or replay the callback with the saved cookie jar from step 1.
3. Complete SePay consent screen.
4. Verify callback response from:
   - `GET /api/v1/workspaces/<WS_ID>/integrations/sepay/oauth/callback?code=...&state=...`
5. Expected callback result:
   - `success: true`
   - `sync.linkedCount` and `sync.totalAccounts`
   - `webhook.endpointId` and `webhook.webhookId`

## 4) Validate provisioning + endpoint storage

Check endpoint list:

```bash
curl "http://localhost:7803/api/v1/workspaces/<WS_ID>/integrations/sepay/endpoints" \
  -H "Authorization: Bearer <YOUR_APP_TOKEN>"
```

Expected:
- At least one active endpoint.
- `token_prefix` present.
- `sepay_webhook_id` present after provisioning.

Database checks:

```sql
select id, ws_id, status, access_token_expires_at, scopes
from sepay_connections
where ws_id = '<WS_ID>';

select id, ws_id, sepay_bank_account_id, sepay_sub_account_id, wallet_id, active
from sepay_wallet_links
where ws_id = '<WS_ID>';

select id, ws_id, active, deleted_at, token_prefix, sepay_webhook_id
from sepay_webhook_endpoints
where ws_id = '<WS_ID>'
order by created_at desc;
```

## 5) Validate webhook ingestion

Use a valid endpoint token returned only on endpoint creation/rotation APIs.

```bash
curl -X POST \
  "http://localhost:7803/api/v1/webhooks/sepay/<ENDPOINT_TOKEN>" \
  -H "Authorization: Bearer <SEPAY_WEBHOOK_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_test_001",
    "gateway": "VCB",
    "transactionDate": "2026-04-09T10:00:00+07:00",
    "accountNumber": "0071000888888",
    "subAccount": null,
    "content": "Thu tien don hang #1001",
    "description": "Thanh toan don hang",
    "transferType": "in",
    "transferAmount": 150000,
    "referenceCode": "REF1001",
    "code": "PAY1001"
  }'
```

Expected:
- API returns success response (processed or duplicate-safe).
- One row in `sepay_webhook_events` for `sepay_event_id = evt_test_001`.
- One row in `wallet_transactions` linked via `created_transaction_id`.

Verify:

```sql
select id, sepay_event_id, status, created_transaction_id, failure_reason
from sepay_webhook_events
where ws_id = '<WS_ID>'
order by received_at desc
limit 20;

select id, wallet_id, category_id, amount, creator_id, description, taken_at
from wallet_transactions
where creator_id in (
  select id from workspace_users where ws_id = '<WS_ID>' and role = 'system'
)
order by created_at desc
limit 20;
```

## 6) Idempotency test

Resend the exact same webhook payload (`id` unchanged).

Expected:
- No extra transaction inserted.
- Event recorded as duplicate/no-op path.

## 7) Expense direction test

Send payload with `transferType: "out"` and positive `transferAmount`.

Expected:
- Created `wallet_transactions.amount` is negative.

## 8) Endpoint lifecycle tests (with deleted_at)

1. Create endpoint (POST endpoints).
2. Rotate endpoint (POST rotate).
3. Delete endpoint (DELETE endpoint).

Expected:
- Deleted endpoint should have:
  - `active = false`
  - `deleted_at is not null`
- List endpoint API should not return soft-deleted rows.
- Webhook token resolution should ignore `deleted_at` rows.

## 9) Disconnect test

Call disconnect:

```bash
curl -X POST \
  "http://localhost:7803/api/v1/workspaces/<WS_ID>/integrations/sepay/disconnect" \
  -H "Authorization: Bearer <YOUR_APP_TOKEN>"
```

Expected:
- `sepay_connections.status = 'revoked'`
- active endpoints become inactive and soft-deleted (`deleted_at` set)

## 10) Failure path tests

- Invalid webhook auth header -> should be rejected.
- Invalid webhook JSON body -> should return validation error.
- Unknown/invalid endpoint token -> should reject.
- Disable feature flag -> all SePay workspace APIs should return forbidden.

## 11) Quick troubleshooting

- OAuth start fails: check OAuth env vars and app origin vars.
- OAuth callback fails with state: ensure the callback runs in the same browser session (or cookie jar) that called the start endpoint, then retry from a fresh start URL.
- Provisioning fails: ensure SePay account has at least one bank account and webhook scopes are granted.
- Webhook unauthorized: ensure SePay sender uses `Authorization: Bearer <SEPAY_WEBHOOK_API_KEY>`.
- No transactions inserted: inspect `sepay_webhook_events.failure_reason` first.
