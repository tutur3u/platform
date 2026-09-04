# Plan 308: Make Calendar Event Creation Idempotent and Recoverable

> **Executor instructions:** Give each logical provider-backed Calendar POST one
> durable identity. A provider success followed by local or transport failure
> must resume the same operation, never create another remote event.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/events/route.ts' apps/calendar/src/lib/calendar/provider-writes.ts apps/calendar/src/lib/calendar/provider-writes.test.ts apps/calendar/src/lib/calendar/event-creation.ts apps/calendar/src/lib/calendar/event-creation.test.ts packages/internal-api/src/calendar.ts packages/internal-api/src/calendar.test.ts packages/sdk/src/platform-calendar.ts packages/sdk/src/platform-calendar.test.ts packages/ui/src/hooks/use-calendar.tsx packages/ui/src/hooks/calendar-create-idempotency.ts packages/ui/src/hooks/calendar-create-idempotency.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plan 086 owns the collection route; share provider primitives with Plan 305
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / provider state
- **Depends on:** Plans 086, 154, 163, and 305; Calendar/database/type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

The live POST creates a Google or Microsoft event before inserting the local
row. If encryption, persistence, or the response fails afterward, the remote
event is orphaned and a user or network retry creates a duplicate.

## Current state and exact contract

- `calendar/events/route.ts:232-260` dispatches provider creation; the local
  `workspace_calendar_events` insert occurs only at lines 287-315.
- `provider-writes.ts:156-200` sends a plain Google insert or Microsoft POST
  without a stable operation marker. The internal API, SDK, and Calendar hook
  do not carry an idempotency key.
- Add private `calendar_event_creation_operations`. Make a UUID
  `Idempotency-Key` header mandatory for POST. Identity is globally
  unique per actor: `UNIQUE(actor_id,idempotency_key)`. Store workspace,
  canonical request hash, encrypted/local payload, provider kind, stage,
  provider identifiers, a 10-minute lease token, attempt count, sanitized error,
  and the completed response. Same actor/key with different workspace or hash
  returns 409 `CALENDAR_EVENT_REPLAY_CONFLICT`; completed replay returns the
  stored success. Missing/invalid keys return 400.
- Reuse Plan 305's provider identity conventions: deterministic Google
  base32hex event ID plus private operation marker; Microsoft Graph
  `transactionId`. On an ambiguous response, look up/adopt only the exact
  matching identity. Never create again while identity is unresolved.
- Stages are `claimed -> provider_created -> completed`. Service-role-only
  `claim_calendar_event_creation`, `checkpoint_calendar_event_creation`,
  `release_calendar_event_creation`, and `finalize_calendar_event_creation`
  RPCs lock the operation and validate the lease token. Finalize inserts the
  local encrypted event and marks completed in one transaction. RPCs are
  migration-owner-owned `SECURITY DEFINER`, use a
  fixed safe `search_path`, revoke `PUBLIC`/`anon`/`authenticated`, and grant
  only `service_role`.
- Never store E2EE title, description, or location plaintext in the operation
  row. Store the existing workspace-key ciphertext and decrypt only in memory
  for dispatch. A raw-row sentinel test must prove plaintext absence.
- A live lease returns 409 `CALENDAR_EVENT_OPERATION_IN_PROGRESS` with
  `Retry-After: 15`. For an explicitly selected Google/Microsoft source, a
  definitive provider rejection releases the lease and returns sanitized 503;
  ambiguity retains the stage for reconciliation. Preserve the native
  `tuturuuu` outbound-mirror contract separately: provider failure finalizes
  the local row with the existing failed sync-health fields and stores/replays
  the 201 response instead of turning a best-effort mirror into a hard failure.
- Reuse one bounded retry helper across internal API, SDK, and UI; only the
  outer logical client owns retries. It performs at most three total attempts
  with the same UUID after 250ms then 1s, honoring integer `Retry-After`
  clamped to 1..15 seconds for the live-lease 409 and transient 503. Inner
  layers never retry. Replay conflict and every other definitive 4xx are
  terminal and clear the stored UI operation.
- Internal API and SDK accept an optional operation UUID and generate it once
  per logical call. The UI stores only `{operationId,payloadHash}` in
  `sessionStorage` under a workspace-scoped key, reuses it across response loss,
  manual retry, and reload, and clears it only on confirmed success or terminal
  4xx. Never persist event text. A later intentional create gets a new UUID.
- Preserve current authorization, normalized workspace, encryption, provider
  selection, native-only creation, response envelope, and outbound mirroring.
  Rust owns GET only and continues falling through POST.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain exact route and
database transfers. Execute after or together with Plan 305 so provider
identity/reconciliation helpers are shared rather than duplicated. Use fake
providers only; no live credentials or calls.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Calendar | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendar/events/route.test.ts' src/lib/calendar/provider-writes.test.ts src/lib/calendar/event-creation.test.ts` | provider/local/transport failure matrix passes |
| Clients | `bun --cwd packages/internal-api vitest run src/calendar.test.ts && bun --cwd packages/sdk vitest run src/platform-calendar.test.ts && bun --cwd packages/ui vitest run src/hooks/calendar-create-idempotency.test.ts` | one UUID is reused and no plaintext is stored |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/calendar-event-creation-operations.test.sql --typegen packages/types/src/supabase.ts` | tenant, ACL, lease, replay, ciphertext, and rollback tests pass |
| Typegen determinism | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot"` | second isolated type generation is byte-identical |
| App gates | `bun run --cwd apps/calendar type-check && bun run --cwd apps/calendar build` | Calendar compiles and builds |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Size | `wc -l 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/events/route.ts' apps/calendar/src/lib/calendar/event-creation.ts` | substantially edited files remain below 700 lines |

## Scope

**In scope:** Calendar collection POST/test; extracted creation orchestrator and
provider seams/tests; internal-api/SDK clients/tests; focused UI idempotency
helper/test and narrow hook edit; one operation migration/pgTAP; generated types.

**Out of scope:** PUT (Plan 305), DELETE (Plan 301), schedule generation,
provider OAuth/scopes, production migration application, Rust GET.

## Steps

1. Add red fake-provider tests for explicit-provider success plus local
   failure, native-mirror rejection still producing/storing 201 with failed
   sync fields, ambiguous create, response loss, same-operation replay,
   overlap, bounded single-owner retry, E2EE plaintext absence, and later
   intentional creation.
2. Add the operation table and exact claim/checkpoint/release/finalize RPCs.
3. Share deterministic Google/Microsoft identity and adoption helpers with Plan
  305, then extract the POST orchestrator and checkpoint before local finalize.
  Keep the creation table/RPCs separate from Plan 305's update/move table so
  their nullable event identity and stage constraints cannot be conflated.
4. Carry and retain one logical UUID through UI, internal API, SDK, and route.
5. Run every focused database, client, build, repository, size, and scope gate.

## Done criteria

- [ ] Provider success plus local/response failure never redispatches creation.
- [ ] Same-key replay returns the stored result; mismatched reuse is terminal 409.
- [ ] UI reload/manual retry reuses one UUID without storing event plaintext.
- [ ] E2EE fields remain encrypted in durable operation storage.
- [ ] Existing native-only, auth, provider, encryption, and response behavior remains.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on active Plan 086/305 overlap; missing provider identity lookup; an
ambiguous call that cannot be reconciled; required OAuth/scope changes;
database/type ownership conflict; an edited source above 700 lines; or a gate
failing twice.

## Maintenance notes

POST, PUT, and DELETE are separate operations but must share provider identity,
lease, error-sanitization, and encrypted-payload primitives.
