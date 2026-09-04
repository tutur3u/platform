# Plan 255: Rotate SePay Endpoints Without Breaking Delivery

> **Executor instructions:** Replace the local-only token swap with a durable,
> replay-safe rotation that updates the exact SePay webhook callback before the
> old token is disabled. At every failure boundary, at least one callback token
> accepted by this application must remain live.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/inventory/src/app/api/v1/workspaces/[wsId]/integrations/sepay/endpoints/[id]/rotate' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/integrations/sepay/service.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/integrations/sepay/shared.ts' 'apps/inventory/src/app/api/v1/webhooks/sepay/[token]/endpoint.ts' apps/inventory/src/lib/sepay-api.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the working Finance/Inventory migration note
  owns `apps/inventory/src/**`, and the SePay handoff remains nonterminal;
  obtain exact-path transfer before editing
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / provider state machine / webhook availability
- **Depends on:** Plans 154 and 163; Finance/Inventory, SePay, database, and
  generated-type ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The rotate route disables the active local token and creates a replacement
that carries the same provider webhook ID, but it never changes the callback
stored at SePay. SePay therefore continues posting to the disabled old-token
URL while the route reports a successful rotation. Every subsequent payment
event fails until an operator repairs or reprovisions the provider webhook.

## Current state and exact contract

- `.../endpoints/[id]/rotate/route.ts:62-101` deactivates the old row before it
  creates the replacement and copies `sepay_webhook_id` without any provider
  operation.
- `.../webhooks/sepay/[token]/endpoint.ts:24-29` accepts only active,
  non-deleted token rows. The old provider callback becomes unauthorized as
  soon as the first update commits.
- `.../integrations/sepay/service.ts:413-424` embeds the raw token in
  `/api/v1/webhooks/sepay/<token>` when the remote webhook is provisioned.
- The official OAuth webhook API supports `GET /api/v1/webhooks/{id}` and
  `PATCH /api/v1/webhooks/{id}` with an optional `webhook_url`. Add typed
  `getSepayWebhook` and `updateSepayWebhookCallback` helpers; do not delete and
  recreate the provider webhook or change its bank/event/auth configuration.
  The executor must verify this against
  `https://developer.sepay.vn/en/sepay-oauth2/api-webhook` before editing.
- Provider-managed rotation requires both stored/live `webhook:read` and
  `webhook:write` scopes. Make `ensureSepayAccessToken` return refreshed scopes
  when it refreshes, then check both before claiming a database child. Missing
  scope returns
  `409 {code:'sepay_reconnect_required',message:'Reconnect SePay with webhook read and write access before rotating'}`
  without changing endpoint state; do not expand OAuth scopes in this plan.
- Add nullable `rotated_from_id uuid` and a closed `rotation_status` on
  `sepay_webhook_endpoints`: existing rows are `complete`; replacement rows are
  `pending`, `remote_updated`, `complete`, or `abandoned`. A partial unique
  index on non-null `rotated_from_id` where
  `rotation_status <> 'abandoned' and deleted_at is null` permits only one live
  child for each source endpoint while retaining abandoned history.
- Add service-role-only private claim/settle/abandon RPCs. Claim locks the
  source row, proves it is active and owned by `p_ws_id`, and inserts or returns
  the one pending child using the caller-supplied token hash/prefix. Settle
  locks both rows, marks the child complete, copies the remote webhook ID, and
  only then deactivates/marks the source rotated in one transaction. Abandon is
  allowed only while provider GET proves the callback still targets the old
  token; it marks the child `abandoned`, inactive, and soft-deleted while
  leaving the source live, thereby freeing the partial unique slot.
- For a provider-managed endpoint, create the replacement as active while the
  old row remains active, PATCH the exact stored webhook ID to the new callback,
  GET it back, and verify the returned URL token hashes to the replacement row.
  Only verified provider state authorizes settle. A deterministic PATCH
  rejection abandons the child and returns sanitized non-2xx; an ambiguous
  network/response failure leaves both rows active and returns
  `503 {code:'sepay_rotation_pending',message:'SePay endpoint rotation is pending reconciliation'}`.
- On retry, inspect the unique child and remote callback first. If the callback
  token verifies against the child, settle without another PATCH. If it still
  verifies against the source, abandon the unrecoverable child and claim a new
  token. Any third/unknown callback is `409 sepay_rotation_conflict` and must
  not mutate either row.
- Preserve the current local-only rotation behavior for rows with no
  `sepay_webhook_id`, but perform its deactivate/create pair transactionally.
  A first-attempt success retains the current endpoint-plus-raw-token response.
  A recovered provider-managed replay may return `token:null` with
  `tokenAlreadyConfigured:true`; the raw callback token must never be stored.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from the completed Plan 163 validator base only
after Plan 154 is green. Read both active Inventory handoffs and obtain exact
transfer. Re-read the official SePay OAuth webhook GET/PATCH contract; a
provider response that does not expose the callback URL needed for
reconciliation is a STOP, not permission to guess.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Provider helpers | `bun --cwd apps/inventory vitest run src/lib/sepay-api.test.ts` | exact GET/PATCH method, URL, body, sanitized failures, and response validation pass |
| Rotation route | `bun --cwd apps/inventory vitest run 'src/app/api/v1/workspaces/[wsId]/integrations/sepay/endpoints/[id]/rotate/route.test.ts'` | local-only, success, deterministic failure, ambiguous retry, conflict, and concurrent calls pass |
| Existing SePay | `bun --cwd apps/inventory vitest run 'src/app/api/v1/workspaces/[wsId]/integrations/sepay' 'src/app/api/v1/webhooks/sepay' src/lib/sepay-api.test.ts` | provisioning, delivery, and disconnect contracts remain green |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/sepay-endpoint-rotation.sql && bun --cwd apps/database sb:validate:isolated` | claims serialize, settle is atomic, ACLs hold, and the full baseline passes |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/sepay-endpoint-rotation.sql` | generated columns/RPC types are current with no unrelated drift |
| Inventory app | `bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | both exit 0 |
| Repository | `bun check && git diff --check` | all canonical gates pass; whitespace output is empty |

## Scope

**In scope:** the rotate route and a new colocated test; SePay GET/PATCH helper
and tests; the narrow provisioning/shared seams required to reuse token/origin
resolution; one additive migration and pgTAP file; generated database types.

**Out of scope:** changing webhook event processing, wallet transaction
creation, OAuth scopes, bank/event/auth configuration, manual endpoint CRUD,
SePay authority migration, Web/Rust/TanStack artifacts, storing raw tokens,
production migration apply, or rotating live credentials during validation.

## Steps

1. Add red provider-helper and route tests that reproduce the current outage:
   successful provider-managed rotation leaves the mocked remote callback on
   the old token, which is then rejected by endpoint resolution. Freeze
   existing auth, feature gating, 404/409 bodies, and local-only success
   response.
2. Add a migration preflight that stops on a duplicate remote webhook ID
   assigned to active endpoints or other invalid active endpoint state. Add the
   closed state columns/index and exact service-role-only RPCs;
   revoke each signature from PUBLIC, `anon`, and `authenticated`.
3. Add pgTAP for ownership, claim idempotency, concurrent claims, illegal state
   transitions, atomic settle rollback, abandonment rules, ACLs, and a chain of
   two completed rotations. Prove an abandoned child does not block a fresh
   claim while a pending/remote-updated/complete child does. Use a deterministic
   two-connection lock barrier for the concurrent claim assertion and always
   release connections on error.
4. Add validated SePay GET/PATCH helpers. Validate PATCH only as a successful
   provider acknowledgement; its response need not contain the full webhook.
   Then require GET detail for the exact requested path ID and full callback
   proof before settlement. Send only `webhook_url` on PATCH. Never log access
   tokens, callback tokens, API keys, or provider response bodies containing
   them.
5. Refactor the route into claim, provider reconcile, and settle phases. Keep
   both local tokens accepted until remote verification. Reconcile ambiguous
   retries from provider GET exactly as specified; never automatically PATCH
   over an unknown third callback.
6. Run focused/existing tests, full isolated DB, typegen, Inventory
   typecheck/build, repository, whitespace, secret-log search, and exact-scope
   gates.

## Done criteria

- [ ] A successful provider-managed rotation has a verified callback whose
      token resolves to the new active row before the old row is disabled.
- [ ] Deterministic failure preserves the old callback/token; ambiguous failure
      remains deliverable and converges safely on retry without another blind
      provider mutation.
- [ ] Concurrent calls create one child and cannot overwrite an unknown remote
      callback; raw tokens are never persisted or logged.
- [ ] Local-only behavior, route authorization, event processing, and provider
      webhook configuration other than URL are unchanged.
- [ ] Focused/full DB, typegen, app typecheck/build, repository, whitespace,
      and scope gates pass.

## STOP conditions

Stop on missing ownership transfer, red Plan 154 baseline, provider GET/PATCH
contract drift, inability to read the full callback URL for reconciliation,
pre-existing duplicate/invalid endpoint state, a supported caller requiring a
different retry envelope, need to expose/store a raw token, production apply,
or any mandatory gate failing twice.

## Maintenance notes

Token rotation is an external state machine, not a local row replacement. A
provider timeout is ambiguous: preserve both locally valid tokens and reconcile
the provider's observed callback before taking another irreversible action.
