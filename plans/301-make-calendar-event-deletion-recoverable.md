# Plan 301: Make Calendar Event Deletion Recoverable

> **Executor instructions:** Turn provider-backed event deletion into one
> resumable operation. Never delete the remote event and then depend on
> unrecorded local cleanup succeeding in the same HTTP request.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route.ts' 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]' apps/calendar/src/lib apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plan 086 owns the exact route and database/type ownership must transfer
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / destructive provider state
- **Depends on:** Plan 086; Plan 154 green baseline; completed Plan 163; database/type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

The DELETE handler removes a Google/Microsoft event first, then reads local
links, writes a habit skip, and deletes the local event. Any later database
failure returns 500 with provider and local state split; a retry can fail on an
already-absent provider object before it reaches local settlement.

## Current state and exact contract

- `calendar/events/[eventId]/route.ts:526-541` deletes the provider event before
  local work. Lines 543-575 then read links, may persist a habit skip, and delete
  `workspace_calendar_events` as separate operations.
- First extract DELETE orchestration into
  `apps/calendar/src/lib/calendar/event-deletion.ts` with a focused test; keep
  the 595-line route as a thin adapter and below 700 lines.
- Add private table `calendar_event_deletion_operations`, unique on
  `(ws_id,event_id)`, storing actor, immutable provider/source identifiers,
  linked task/habit response facts, status (`pending`, `provider_deleted`,
  `completed`), lease timestamps, attempt count, sanitized last error, and
  completion timestamps. Do not store provider credentials or decrypted event
  content.
- Add service-role-only private claim, provider-checkpoint, attempt-release,
  and finalize RPCs. Claim locks and validates the tenant event, snapshots
  linkage facts, and returns the same operation plus a fresh lease-token UUID
  on replay. Only an expired 10-minute `pending` lease can be reclaimed.
  Provider-checkpoint accepts the operation and matching live lease token and
  atomically changes `pending` to `provider_deleted` immediately after a
  confirmed/already-absent provider result. A definitive provider rejection
  calls attempt-release with that same token to retain `pending`, clear the
  lease, increment attempts, and store only a sanitized error; an ambiguous
  transport outcome deliberately retains the lease until expiry. Finalize
  locks `provider_deleted`, inserts the habit skip when applicable, deletes the
  tenant event (letting junction FKs settle), and marks completed in one
  transaction. Local-only operations checkpoint directly before finalize.
- All RPCs are `SECURITY DEFINER`, migration-owner-owned, use a fixed safe
  `search_path` plus fully qualified objects, `REVOKE ALL` from `PUBLIC`,
  `anon`, and `authenticated`, and grant EXECUTE only to `service_role`.
- Local-only events skip provider dispatch and settle directly. Provider-backed
  operations call the exact stored source/event identity. Confirmed provider
  deletion and provider `not found/already absent` both advance to
  `provider_deleted`; transient/provider rate errors retain `pending` and return
  sanitized 503 plus `Retry-After: 15`. A transport result whose provider
  acceptance cannot be classified must remain pending for same-operation
  reconciliation, never create a second operation or delete local state blindly.
- Replays of `completed` return the original 200 payload. Replays of
  `provider_deleted` run only finalize and never redispatch the provider.
  Stale/mismatched lease tokens fail closed without changing state. Overlapping
  live leases return 409 with `Retry-After: 15`. Preserve authorization,
  read-only-source 400, absent/foreign 404, and success response fields.
- Rust currently owns GET only and falls through DELETE; keep it unchanged.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Resume only after Plan
086 transfers the exact route. Characterize Google and Microsoft delete error
shapes with fake adapters; stop if already-absent cannot be classified without
live calls. Use isolated local Supabase only.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused Calendar | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route.test.ts' src/lib/calendar/event-deletion.test.ts` | replay, provider/local failures, links, and concurrency pass |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/calendar-event-deletion-operations.test.sql --typegen packages/types/src/supabase.ts` | claim/checkpoint/release/finalize/lease/rollback pgTAP passes |
| Typegen determinism | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot"` | second isolated generation is byte-identical |
| Calendar | `bun run --cwd apps/calendar type-check && bun run --cwd apps/calendar build` | Calendar compiles and builds |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Size | `wc -l 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route.ts' apps/calendar/src/lib/calendar/event-deletion.ts` | both substantially edited files are below 700 lines |

## Scope

**In scope:** Calendar event item DELETE adapter/test; extracted deletion
orchestrator/test; one operation migration and exact pgTAP; generated types.

**Out of scope:** GET/PATCH semantics from Plan 086; schedule cleanup from Plan
237; provider create/update; UI redesign; Rust GET; production migration apply.

## Steps

1. Add provider/persistence seams and red tests for local-only, provider success,
   already absent, provider failure, post-provider settlement failure, habit and
   task links, replay, and overlapping leases.
2. Add operation storage and claim/checkpoint/release/finalize RPCs with fixed
   search paths, service-role-only EXECUTE, tenant validation, lease-token
   checks, row locks, and rollback tests.
3. Extract the orchestrator, make DELETE claim then dispatch then settle, and
   preserve exact existing HTTP outcomes where frozen above.
4. Run focused, isolated database/typegen, Calendar type/build, repository,
   whitespace, size, and scope gates.

## Done criteria

- [ ] Provider success plus local failure is durable and retryable without another operation.
- [ ] Provider already-absent converges to local completion.
- [ ] Habit skip and local event deletion commit together.
- [ ] Overlap/replay return deterministic non-secret outcomes.
- [ ] Rust GET behavior and unrelated Calendar methods are unchanged.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on Plan 086 overlap; inability to classify provider absence safely;
provider semantics requiring non-idempotent blind retry; historical event/link
states that need operator repair; missing database/type transfer; a source file
remaining above 700 lines after substantial edits; or any mandatory gate
failing twice.

## Maintenance notes

Remote deletion and local settlement cannot be one database transaction. Keep
their durable operation identity and replay behavior explicit.
