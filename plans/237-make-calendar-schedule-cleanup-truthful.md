# Plan 237: Make Calendar Schedule Cleanup Truthful and Recoverable

> **Executor instructions:** Treat an explicit empty desired schedule as a real
> cleanup request, delete orphan junctions/events in one transaction, and never
> report an event ID as deleted unless PostgreSQL confirmed it.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/schedule' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — execute after Plan 233 and the green Plan 154
  database baseline
- **Priority:** P1
- **Effort:** M
- **Risk:** HIGH
- **Category:** correctness / destructive state / recovery
- **Depends on:** Plans 154, 163, and 233; Calendar/database ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The schedule route skips orphan deletion whenever zero preview events were
processed, so removing the last schedulable task/habit cannot clear prior
unlocked auto-events. When cleanup runs, both junction-delete errors are
ignored, the event-delete failure is only a warning, and the response still
returns `success:true` plus every candidate ID as `deletedEventIds`.

## Current state and exact contract

- Build on Plan 233's distinction: absent `previewEvents` generates a schedule;
  explicitly supplied `[]` is a valid empty desired schedule.
- Cleanup is allowed only after request/source validation succeeds and every
  requested event was successfully updated, reused, or atomically created.
  Any processing failure skips cleanup and returns
  `409 {success:false,code:'schedule_apply_incomplete',error:'Schedule changes were not fully applied',deletedEventIds:[],warnings:[...]}`.
- For a valid complete nonempty or empty desired schedule, delete the computed
  unlocked route-workspace orphans through one service-role-only transaction.
  Success returns the existing response shape with `deletedEventIds` equal to
  the UUIDs actually returned by the transaction and `eventsDeleted` equal to
  that array length.
- Cleanup transaction failure returns sanitized
  `500 {success:false,code:'schedule_cleanup_failed',error:'Failed to clean up orphaned events',deletedEventIds:[]}`.
  Do not report candidate IDs or continue metadata success writes.
- Preserve locked events, window/scope selection, encryption, provider data,
  and successful update/create/reuse semantics.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Start from a reviewed Plan 233 result on the completed Plan
163 base after Plan 154 is green. Do not independently rework the same route or
repeat Plan 233's source/RPC migration.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendar/schedule/route.test.ts' src/lib/calendar/schedule-apply.test.ts` | empty cleanup, processing failure, RPC failure, confirmed IDs, and metadata cases pass |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/calendar-schedule-cleanup.sql && bun --cwd apps/database sb:validate:isolated` | valid/foreign/locked/rollback cleanup assertions and full suite pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/calendar-schedule-cleanup.sql` | cleanup RPC types are current with no unrelated drift |
| Calendar | `bun run --cwd apps/calendar type-check && bun run --cwd apps/calendar build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** Plan 233's focused schedule apply module/route tests; one additive
private cleanup RPC migration and pgTAP file; generated DB types. **Out of
scope:** source validation/event-create RPC (Plan 233), scoring, provider sync,
locked-event behavior, changing window/scope rules, UI/messages, historical
provider events, production apply, or shared-core extraction.

## Steps

1. Freeze successful nonempty response fields and add red route tests for a
   valid explicit empty preview with existing orphans, all-event processing
   failure, one-of-many failure, habit-junction failure, task-junction failure,
   event-delete failure, a successful retry after cleanup rollback, and metadata
   not being written after cleanup failure.
2. Make schedule application return a discriminated internal result: complete
   with confirmed applied events, or incomplete with failures. Warnings that do
   not represent a persistence failure may preserve the existing partial
   metadata; any requested-event persistence failure takes the exact 409 path
   and must not invoke cleanup.
3. Create service-role-only
   `private.delete_workspace_schedule_orphans(p_ws_id uuid,
   p_event_ids uuid[]) returns setof uuid`. Lock selected event rows, require
   every supplied ID to exist in `p_ws_id` and be unlocked, reject duplicate or
   foreign/missing IDs, delete both junction sets and events in one transaction,
   and return only IDs deleted. Empty input returns zero rows. Revoke the exact
   signature from PUBLIC, `anon`, and `authenticated`; grant only
   `service_role`.
4. Add pgTAP for empty input, habit/task/mixed orphan sets, locked/foreign/
   missing/duplicate IDs, junction-trigger failure rollback, exact returned
   IDs, and function ACLs. No fixture may silently survive a failed transaction
   in a partially unlinked state.
5. Call the RPC for every complete desired schedule, including explicit empty.
   Compare returned IDs as a set with candidates; a mismatch is failure. Update
   deletion stats/metadata only after confirmation. Return the closed 409/500
   envelopes above on incomplete apply/cleanup and never serialize unconfirmed
   candidates.
6. Run focused/full DB, isolated typegen, Calendar typecheck/build, repository,
   source-size, whitespace, and exact-scope gates.

## Done criteria

- [ ] Explicit empty schedules remove all eligible unlocked orphans in scope.
- [ ] Junction and event deletion is one transaction with service-role-only
      execution.
- [ ] `deletedEventIds` and `eventsDeleted` contain confirmed deletions only.
- [ ] Incomplete application or cleanup is non-success and cannot write success
      metadata.
- [ ] Retrying the same desired preview after a rolled-back cleanup converges
      without duplicate events or stale junctions.
- [ ] Focused/full DB, typegen, Calendar typecheck/build, repository, and
      whitespace gates pass.

## STOP conditions

Stop if Plan 233 is not reviewed, Plan 154 is red, current clients depend on
`success:true` for failed cleanup, the desired treatment of locked/provider
events is ambiguous, cleanup candidates cannot be proven workspace-bound,
production apply is required, or any mandatory gate fails twice.
