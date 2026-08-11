# Plan 312: Make Calendar Outbound Sync Replay-Safe

> **Executor instructions:** Make the canonical Calendar sync job resume one
> durable provider-creation operation per local event. A provider success
> followed by a database or process failure must adopt and settle the same
> remote event, never create another one.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/sync/route.ts' 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/sync/route.test.ts' apps/calendar/src/lib/calendar/provider-writes.ts apps/calendar/src/lib/calendar/provider-writes.test.ts apps/calendar/src/lib/calendar/outbound-sync.ts apps/calendar/src/lib/calendar/outbound-sync.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — canonical sync, provider primitives, and database/type paths require transfer
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / provider state
- **Depends on:** Plans 115, 154, 163, 305, and 308; Calendar/database/type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

Outbound sync creates a remote Google or Microsoft event and only afterward
writes its provider ID into the local row. If that write fails, the row is
marked `failed`; the next sync selects it and creates another remote event.

## Current state and exact contract

- `calendar/sync/route.ts:477-487` selects up to 250 `local_only`/`failed`
  events without an external ID. Lines 499-510 create remotely, lines 514-536
  persist the provider identity, and lines 538-552 mark any failure back to the
  same retry-eligible state.
- `provider-writes.ts:156-200` currently has no deterministic Google event ID,
  Microsoft `transactionId`, or lookup/adoption marker. Plans 305/308 establish
  those shared primitives; reuse them rather than adding a third identity
  convention.
- Add private `calendar_outbound_sync_operations`, with one row uniquely keyed
  by `(ws_id,event_id,target_provider,target_calendar_id)`. Store the event's
  current `mutation_revision` from Plan 305, a canonical ciphertext/request
  hash, stage, provider identifiers, 10-minute lease token/time, attempt count,
  and sanitized error. Never store decrypted title, description, or location.
- Stages are `claimed -> provider_created -> completed`. Service-role-only
  `claim_calendar_outbound_sync`, `checkpoint_calendar_outbound_sync`,
  `release_calendar_outbound_sync`, and `finalize_calendar_outbound_sync` RPCs
  lock the operation and validate its lease. They are migration-owner-owned
  `SECURITY DEFINER`, use a fixed safe `search_path`, revoke
  `PUBLIC`/`anon`/`authenticated`, and grant only `service_role`.
- Claim verifies that the event remains in the workspace, is local-only/failed,
  has no external ID, and targets the same configured provider/calendar.
  Concurrent/live claims skip that event rather than dispatching. An expired
  claim may be reclaimed atomically.
- Provider creation uses the operation's deterministic Google ID/private marker
  or Microsoft transaction ID. Explicit rejection records a retryable error;
  an ambiguous response is reconciled by exact marker lookup. Once the remote
  identity is known, checkpoint it before any event update and never call
  provider create for that operation again.
- If the local event changes after provider creation, reuse Plan 305's provider
  update primitive to converge that same remote object to the latest revision,
  update the stored revision/hash, then finalize. Do not create a second
  operation or overwrite a concurrent local edit. Finalize atomically writes
  provider IDs/sync fields and marks the operation completed.
- Extract outbound orchestration from the 763-line route into
  `apps/calendar/src/lib/calendar/outbound-sync.ts`; leave a thin route call so
  every substantially edited source remains under 700 lines.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Execute only after the
listed plans and exact paths transfer. Use fake providers only; do not apply a
production migration or contact live calendars.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Calendar tests | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendar/sync/route.test.ts' src/lib/calendar/outbound-sync.test.ts src/lib/calendar/provider-writes.test.ts` | replay, ambiguity, overlap, revision drift, and existing route contracts pass |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/calendar-outbound-sync-operations.test.sql --typegen packages/types/src/supabase.ts` | tenant, ACL, lease, checkpoint, finalize, and rollback cases pass |
| Typegen determinism | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot"` | second isolated type generation is byte-identical |
| App gates | `bun run --cwd apps/calendar type-check && bun run --cwd apps/calendar build` | Calendar compiles and builds |
| Size | `wc -l 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/sync/route.ts' apps/calendar/src/lib/calendar/outbound-sync.ts` | each substantially edited file is below 700 lines |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** canonical sync route/test; extracted outbound orchestrator/test;
shared provider identity/reconciliation seam/test; one private operation
migration/pgTAP; generated types; `plans/README.md` status only.

**Out of scope:** inbound sync; interactive POST/PUT/DELETE state machines;
OAuth/scopes; cooldown duration; production migration application; Rust (it
does not own this mutation).

## Steps

1. Add failing fake-provider and pgTAP cases for provider success plus local
   failure, ambiguous create, overlap, expired lease, revision drift, retry,
   exact adoption, and plaintext absence.
2. Add the private operation table and exact claim/checkpoint/release/finalize
   RPCs with the frozen ACL and tenant contract.
3. Extract outbound orchestration, reuse Plans 305/308 provider identities, and
   checkpoint before local settlement.
4. Preserve Plan 115 authorization/source/cooldown behavior and all existing
   response counts while making per-event failures truthful and resumable.
5. Run every focused database, app build, repository, size, and scope gate.

## Done criteria

- [ ] Provider success plus local/process failure never dispatches a second create.
- [ ] Ambiguous outcomes adopt only the exact deterministic provider identity.
- [ ] Overlapping syncs cannot own or dispatch the same event concurrently.
- [ ] Revision drift updates the known remote object before atomic finalization.
- [ ] No decrypted event content is persisted in operation storage.
- [ ] The canonical route is below 700 lines and every mandatory gate passes.

## STOP conditions

Stop on owner/dependency overlap; missing provider identity lookup; an ambiguous
call that cannot be reconciled; required provider scope changes; historical
duplicate operation identities; inability to keep plaintext out of storage; an
edited source above 700 lines; or a gate failing twice.

## Maintenance notes

Interactive create/update/delete and background outbound sync keep separate
operation tables, but must share deterministic provider identity, reconciliation,
lease, sanitization, and encrypted-payload conventions.
