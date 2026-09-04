# Plan 305: Make Calendar Provider Updates and Moves Recoverable

> **Executor instructions:** Turn every provider-backed Calendar PUT into a
> resumable staged operation. Never repeat a provider create, move, update, or
> delete merely because a later stage or the local database settlement failed.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route.ts' apps/calendar/src/lib/calendar/provider-writes.ts apps/calendar/src/lib/calendar/provider-writes.test.ts apps/calendar/src/lib/calendar/event-mutation.ts apps/calendar/src/lib/calendar/event-mutation.test.ts packages/internal-api/src/calendar.ts packages/internal-api/src/calendar.test.ts packages/sdk/src/platform-calendar.ts packages/sdk/src/platform-calendar.test.ts packages/ui/src/hooks/use-calendar.tsx packages/ui/src/hooks/calendar-update-idempotency.ts packages/ui/src/hooks/calendar-update-idempotency.test.ts packages/ui/src/hooks/__tests__/use-calendar-readonly.test.tsx apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plan 086 owns the route and Plan 301 must settle the adjacent deletion state machine first
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / provider state
- **Depends on:** Plans 086 and 301; Plan 154 green baseline; completed Plan 163; Calendar/database/type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

The live PUT mutates Google or Microsoft before the local event row. A local
failure therefore returns 500 after an external change already happened. The
move helper can also create duplicates: a successful Google move followed by a
failed update falls through to create-delete, while a cross-provider target is
created before source deletion and is recreated on retry.

## Current state and exact contract

- `calendar/events/[eventId]/route.ts:280-321` dispatches provider work before
  the workspace-qualified update at lines 460-475.
- `provider-writes.ts:286-344` implements provider-to-native deletion, Google
  move-then-update with a broad fallback catch, and cross-provider
  create-then-delete without a durable checkpoint.
- After Plans 086 and 301, extract PUT orchestration into
  `apps/calendar/src/lib/calendar/event-mutation.ts`; keep the item route a thin
  adapter and below 700 lines. Do not widen Plan 301's deletion-only operation
  contract silently.
- `workspace_calendar_events` currently has no `updated_at`. Add
  `mutation_revision bigint NOT NULL DEFAULT 0` and a migration-owned BEFORE
  UPDATE trigger that always assigns `OLD.mutation_revision + 1`, ignoring any
  caller-supplied value. Add concurrency/pgTAP proving every writer receives a
  new revision and cannot preserve or choose it.
- Add private `calendar_event_mutation_operations`. Claim locks the tenant
  event and stores the actor, canonical request hash, base mutation revision,
  immutable source/target identities, the recoverable requested provider payload, staged
  provider identifiers, status, a 10-minute lease token, attempt count,
  sanitized last error, and timestamps. The base revision is an optimistic
  concurrency fact, not the replay identity.
- Make a UUID `Idempotency-Key` header mandatory for every PUT before provider
  or local mutation. The operation's unique identity is
  `(actor_id,idempotency_key)`; store `ws_id`, `event_id`,
  `base_mutation_revision`, and `request_hash` as immutable conflict fields.
  Same actor/key plus different workspace, event, or payload returns 409
  `CALENDAR_EVENT_REPLAY_CONFLICT`; completed same-key replay returns the stored
  success even after the event revision advances. Missing/invalid keys return
  sanitized 400 `CALENDAR_EVENT_IDEMPOTENCY_KEY_REQUIRED`.
- Extend `packages/internal-api/src/calendar.ts` and
  `packages/sdk/src/platform-calendar.ts` to accept an optional caller-owned
  operation UUID, generate one with `crypto.randomUUID()` only once per logical
  call when absent, and send it as `Idempotency-Key`. Each client performs at
  most three total attempts with the same UUID: retry network/5xx after 250ms
  then 1s; retry only 409 code `CALENDAR_EVENT_OPERATION_IN_PROGRESS` and
  transient 503 while honoring integer `Retry-After` clamped to 1..15 seconds.
  `CALENDAR_EVENT_REPLAY_CONFLICT` and every other definitive 4xx are terminal,
  never retried, and clear the persisted UI operation entry. The SDK exposes
  the UUID option so a caller starting a later retry can deliberately reuse it.
- Add `packages/ui/src/hooks/calendar-update-idempotency.ts`. Before queueing,
  hash the canonical cleaned update JSON with SHA-256 and store only
  `{operationId,payloadHash}` in `sessionStorage` key
  `tuturuuu:calendar:update-operation:<wsId>:<eventId>`; never store event text.
  Reuse the entry for the same payload across queue failure, manual retry, or
  page reload. Clear it only on confirmed 2xx or a definitive non-retryable 4xx.
  A different payload overwrites it with a new UUID. Replace `_updateId` with
  this operation UUID and retain it after retry exhaustion; add fake-timer,
  storage-reload, same-payload, changed-payload, and plaintext-absence tests.
- Never persist E2EE title, description, or location in plaintext in the
  operation row. When the event/request uses workspace encryption, store those
  fields only in the existing workspace-key ciphertext form with an explicit
  encrypted marker, decrypt only in memory for provider dispatch, and finalize
  the same ciphertext locally. The existing key-unavailable rejection remains
  fail closed. Non-sensitive fields and already-unencrypted event payloads may
  use the private operation JSON needed for replay. Tests must search the raw
  operation row for a unique E2EE plaintext sentinel and find no match.
- Use service-role-only claim, checkpoint, release, and finalize RPCs. All are
  `SECURITY DEFINER`, migration-owner-owned, have a fixed safe `search_path`
  plus qualified references, revoke EXECUTE from `PUBLIC`/`anon`/
  `authenticated`, and grant only `service_role`. Every transition validates
  the current lease token and predecessor stage under a row lock.
- Freeze stages by transition: same-provider update = `claimed -> updated ->
  completed`; native-to-provider = `claimed -> target_created -> completed`;
  provider-to-native = `claimed -> source_deleted -> completed`; Google
  calendar move = `claimed -> moved -> updated -> completed`; cross-provider =
  `claimed -> target_created -> source_deleted -> completed`. Checkpoint each
  confirmed provider result before the next provider call. Finalize performs
  the encrypted/local row update and marks completed in one transaction.
- Once Google move succeeds, retry only the update against the checkpointed
  moved event; never enter create-delete fallback. Once a target create is
  checkpointed, retry only source deletion/finalization; never create another
  target. Provider already-applied/not-found outcomes are accepted only where
  the operation stage and stored provider IDs prove the intended transition.
- Provider create calls use the operation UUID as the idempotency identity.
  For Google, derive and persist one API-valid lowercase base32hex event ID from
  the UUID, pass it to `events.insert`, attach the operation UUID in private
  extended properties, and on ambiguous/409 outcomes `events.get` that exact ID
  and adopt it only when the stored marker matches. For Microsoft, pass the
  persisted UUID as Graph `transactionId` on every identical create retry and
  require the response to return one immutable event ID before checkpointing;
  a retry that cannot return/prove the same created event is a STOP condition.
- Reconcile an ambiguous Google calendar move by getting the known event ID in
  the destination first, then the source. Exactly one matching location selects
  the next stage; both or neither remain ambiguous and never enter create-delete.
  Updates always address a checkpointed existing event ID, and deletes retain
  the already-absent handling characterized by Plan 301.
- A definitive provider rejection releases the lease, retains its current
  stage, and returns sanitized 503 with `Retry-After: 15`. An ambiguous outcome
  retains the live lease for reconciliation. A concurrent live lease returns
  409 with `Retry-After: 15`. Completed replay returns the original success
  payload. Preserve authorization, read-only 400, absent/foreign 404,
  encryption, sync-health fields, and local-only metadata updates.
- Rust owns GET only and falls through PUT; keep it unchanged.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain exact transfers
and execute only after Plans 086 and 301. Inventory both provider SDKs with
fake adapters; no live provider calls or credentials are permitted.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused Calendar | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route.test.ts' src/lib/calendar/provider-writes.test.ts src/lib/calendar/event-mutation.test.ts && bun --cwd packages/internal-api vitest run src/calendar.test.ts && bun --cwd packages/ui vitest run src/hooks/calendar-update-idempotency.test.ts src/hooks/__tests__/use-calendar-readonly.test.tsx` | every stage, header, retry, storage replay, overlap, and failure case passes |
| SDK | `bun run --cwd packages/sdk type-check && bun --cwd packages/sdk vitest run src/platform-calendar.test.ts` | generated/reused idempotency header contract passes |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/calendar-event-mutation-operations.test.sql --typegen packages/types/src/supabase.ts` | revision, E2EE, tenant, ACL, lease, stage, and rollback pgTAP passes |
| Typegen determinism | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot"` | second generated output is byte-identical |
| Calendar | `bun run --cwd apps/calendar type-check && bun run --cwd apps/calendar build` | Calendar compiles and builds |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Size | `wc -l 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route.ts' apps/calendar/src/lib/calendar/event-mutation.ts` | both substantially edited files remain below 700 lines |

## Scope

**In scope:** Calendar event PUT adapter/test; extracted mutation
orchestrator/test; provider write seams/tests; internal-api/SDK update clients
and tests; focused UI idempotency helper/test plus narrow Calendar hook/update
test; one operation migration and pgTAP; generated types.

**Out of scope:** DELETE behavior owned by Plan 301; schedule cleanup; Calendar
UI redesign; provider credential/OAuth changes; Rust GET; production migration
application.

## Steps

1. Add red fake-provider tests for all five transition shapes, especially
   move-success/update-failure, create-success/delete-failure, ambiguous create,
   local-finalize failure, same-operation replay, and overlap.
2. Add the monotonic event revision trigger plus operation storage and exact
   claim/checkpoint/release/finalize RPCs with encrypted E2EE payloads, tenant
   validation, leases, ACLs, and stage-machine pgTAP.
3. Add deterministic Google event-ID/marker adoption, Microsoft transaction-ID
   replay, and Google move-location reconciliation; split move failure handling
   so a completed move cannot fall into create-delete.
4. Wire one logical idempotency UUID through the UI, internal API, SDK, route,
   and claim contract; extract the PUT orchestrator, checkpoint after every
   irreversible provider result, and finalize encrypted/local state.
5. Run every focused, isolated database/typegen, Calendar build, repository,
   size, whitespace, and scope gate.

## Done criteria

- [ ] Provider success plus local failure resumes without repeating provider work.
- [ ] Google move success plus update failure never creates a duplicate.
- [ ] Cross-provider target creation plus source-delete failure never recreates the target.
- [ ] Ambiguous provider results reconcile by the exact operation identity or fail closed.
- [ ] Every event update advances an unforgeable mutation revision and E2EE fields never appear plaintext in operation storage.
- [ ] Same-key replay returns the stored result; key/payload mismatch fails 409; every intentional edit uses a new UUID.
- [ ] Response loss, bounded automatic retry, manual same-payload retry, and tab reload all reuse the same stored UUID without persisting event content.
- [ ] Local-only, encryption, sync-health, authorization, and response contracts remain compatible.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on active Plan 086/301 overlap; missing provider correlation lookup or an
ambiguous provider call that cannot be reconciled; historical duplicate remote
identities; a required OAuth/scope change; database/type ownership conflict; a
substantially edited source remaining above 700 lines; or a mandatory gate
failing twice.

## Maintenance notes

Provider mutation and database settlement are separate systems. Every future
stage must preserve the operation identity and checkpoint before the next
fallible action.
