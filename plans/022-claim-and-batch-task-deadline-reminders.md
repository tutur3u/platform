# Plan 022: Claim and Batch Task Deadline Reminders

> **Executor instructions:** Replace the global unbounded check-then-send loop
> with bounded, lease-based idempotent work. Preserve reminder timing,
> preferences, and the current root-workspace rollout restriction.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/tasks/src/app/api/cron/tasks/deadline-reminders apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on reminder schema, notification RPC, or route ownership drift.

## Status

- **Execution status:** TODO
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** Correctness / Performance / Notifications
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

The five-minute cron loads every due task and watcher, then performs multiple
sequential RPCs per task/interval/recipient. It checks tracking, creates the
notification, and records tracking separately. Overlapping invocations can both
pass the check and create duplicate reminders before either upsert records the
delivery; backlog size also increases time to the first useful result.

## Current state

- `apps/tasks/src/app/api/cron/tasks/deadline-reminders/route.ts:165-205`
  fetches the complete due window with all watchers and no limit/cursor.
- Lines 233-355 nest task, interval, and watcher loops with a sent check,
  preference check, notification creation, then tracking RPC.
- `apps/database/supabase/migrations/20260519042607_move_notification_tables_private.sql:121-166`
  keeps `task_reminder_already_sent` and `record_task_reminder_sent` separate;
  the unique upsert happens after notification creation.
- The tracking table's uniqueness key is `(task_id, user_id,
  reminder_interval)`, but it has no claim status, lease, attempt, or terminal
  error fields.
- The sibling route test only covers `shouldSkipDeadlineReminderTask`.
- `RESTRICT_TO_ROOT_WORKSPACE_ONLY` is currently `true`; this plan must not
  broaden rollout scope.

## Required skills and preflight

Load `$tuturuuu-database`, `$tuturuuu-platform`, and
`$tuturuuu-agent-coordination`. Inspect active migration ownership and create a
new additive migration with `bun sb:new`; never run production push commands.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/tasks vitest run 'src/app/api/cron/tasks/deadline-reminders/route.test.ts'` | exit 0; overlap, retry, and batch cases pass |
| Migration tests | `cd apps/database && bunx supabase test db` | all pgTAP tests pass, including exclusive and recoverable claims |
| Migration validation | `bun sb:up` followed by `bun sb:typegen` | local migration applies; generated types reflect RPC/table changes |
| Tasks typecheck | `bun type-check:tasks` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Tasks build | `bun --cwd apps/tasks run build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/tasks/src/app/api/cron/tasks/deadline-reminders/route.ts`
- Its sibling `route.test.ts`
- One new additive migration and one focused pgTAP test
- Generated database types after the migration is applied locally

Do not change reminder intervals, copy, notification preference semantics,
cron authentication/schedule, email delivery, root-only rollout, or unrelated
notification batching.

## Git workflow

- Branch: `fix/task-reminder-claims` in an isolated worktree; run `bun setup`.
- Conventional Commit: `fix(tasks): claim deadline reminders atomically`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Characterize current eligibility

Extract pure interval/window helpers and add route tests for active vs resolved
tasks, disabled settings, preferences, interval edges, zero watchers, and the
root-only filter. Preserve response fields used by cron observability.

**Verify:** characterization tests pass before schema changes.

### Step 2: Add a durable claim state and bounded claim RPC

Add rollout-safe claim metadata to the private tracking table (status,
lease/claimed timestamp, attempts, and last error or equivalent). Create a
service-role-only RPC that, in one transaction, selects a bounded oldest work
set, inserts/claims each unique `(task,user,interval)` tuple, skips already-sent
rows, and reclaims only expired processing leases. Use row locking/unique
conflict handling so two callers cannot claim the same tuple.

Return only the data the route needs. Cap each claim (start with a named
constant such as 100) and make ordering deterministic. Do not mark a row sent
until notification creation succeeds; on failure retain a retryable state with
bounded attempts/lease expiry.

**Verify:** pgTAP proves two simulated claimers receive disjoint tuples,
successful rows never reclaim, expired claims do reclaim, and active claims do
not.

### Step 3: Process claims with controlled concurrency

Replace the unbounded tasks query and nested sent-check loop with repeated
bounded claim pages while a named time budget remains. Process a small fixed
number concurrently. For each claim, check preferences, create the notification,
then atomically mark sent with its notification ID; mark skipped preferences as
terminal and failures retryable. Check every RPC error and count only confirmed
sent rows.

**Verify:** route tests run two overlapping invocations and assert exactly one
notification per tuple; partial failures retry without duplicating successful
rows; a full batch reports continuation/backlog state.

### Step 4: Apply locally, typegen, and run gates

Apply the migration locally before typegen. Replace route `any` casts made
unnecessary by generated types. Run every command in the table; the Tasks build
is mandatory for this route change.

## Test plan

Model database assertions on existing private notification pgTAP tests and
route mocks on the sibling file. Cover overlap, expired lease, partial create
failure, preference skip, batch boundary, no work, and authorization denial.

## Done criteria

- [ ] Claiming is bounded, deterministic, exclusive, and lease-recoverable.
- [ ] Notification creation cannot race ahead of uniqueness ownership.
- [ ] Successful tuples send once; failed tuples retry without replaying success.
- [ ] Root-only rollout and existing preference/timing semantics remain.
- [ ] Migration tests, route tests, typecheck, `bun check`, build, and whitespace
      pass.

## STOP conditions

Stop if notification creation itself cannot be idempotently correlated with a
claim, active migration ownership overlaps the new table/RPC, existing rows
violate the uniqueness assumption, or local Supabase cannot apply the migration.

## Maintenance notes

Do not remove the root-only flag until backlog, processing time, retry count,
and duplicate-rate telemetry show the bounded worker is healthy.
