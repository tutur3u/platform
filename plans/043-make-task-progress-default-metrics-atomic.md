# Plan 043: Make Task-Progress Default Metrics Atomic

> **Executor instructions:** Enforce at most one active default per workspace and make
> clear-and-set operations transactional. A failed transition must preserve the
> prior default, and concurrent transitions must not create multiple defaults.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/tasks/src/app/api/v1/workspaces/'[wsId]'/task-progress/metrics apps/tasks/src/app/api/v1/workspaces/'[wsId]'/task-progress/_utils.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on material metric schema, fallback, authorization, or active-owner drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** Bug / Concurrency / Data integrity
- **Depends on:** Plan 057
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while Plan 057 remains blocked on generated database type
ownership. Keep the ownership-policy migration separate and land it first.

## Why this matters

Creating or selecting a default metric first clears the existing default and
then performs another write. Failure can unintentionally leave no default, while concurrent
requests can create multiple defaults and make consumers choose an unstable
first row.

## Current state

- `metrics/route.ts:64-84` clears all active defaults, then inserts the new row.
- `metrics/[metricId]/route.ts:24-45` clears peers before proving the target
  exists or its update succeeds; a missing id returns 404 after state changed.
- `20260625113400_add_task_progress_parity.sql:33-38` enforces active metric-name
  uniqueness and adds an ordering index, but no partial unique default index.
- Task-progress consumers sort `is_default DESC, created_at ASC` and take the
  first metric; they do not repair duplicate/zero-default state transactionally.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$supabase-postgres-best-practices`, plus `$tuturuuu-agent-coordination` for the
shared checkout. Execute after Plan 057 establishes Task Progress object
ownership, and refresh this plan against its policy/helper migration. Inspect active Tasks ownership notes. Query local data for
duplicate defaults before adding the invariant; production changes remain
migration-only for the operator to apply. This plan enforces **at most one**
active default and atomic switching; it does not require every workspace to
have a default, because explicit unset/archive currently permits zero.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Database reset | `bun sb:reset` | migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | all pgTAP tests pass |
| Type generation | `bun sb:typegen` | generated types match local schema |
| Route tests | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-progress/metrics/route.test.ts'` | all cases pass |
| Tasks typecheck | `bun run --cwd apps/tasks type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Additive migration, pgTAP tests, and regenerated DB types
- Metric collection/item handlers and one focused route test file
- Minimal `_utils.ts` error mapping needed for typed RPC outcomes

Do not redesign metric scoring, gamification, stats, names, archival policy, or
the task-progress UI.

## Git workflow

- Branch: `fix/atomic-task-progress-defaults` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(tasks): make default metrics atomic`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Reconcile and enforce the invariant

Add a partial unique index on `ws_id` where `is_default = true` and
`archived_at IS NULL`. STOP and report exact workspace/id counts if duplicate
defaults exist; do not silently choose or delete historical data.

### Step 2: Add server-only transactional operations

Create private functions for create-as-default and set-existing-as-default.
Lock the workspace's active metric set, validate the target before clearing,
clear peers and insert/update atomically, and return the committed row. Revoke
execute from `PUBLIC`, `anon`, and `authenticated`; validate workspace and ids
inside the function.

### Step 3: Use typed outcomes in the routes

Keep non-default mutations on the simple path. Route default mutations through
the transaction, mapping missing target to 404 and invariant conflicts to a
deterministic conflict response. Do not clear a default from application code.

## Test plan

- pgTAP: create default, switch default, missing target rollback, injected
  insert/update failure rollback, archived rows, and concurrent competing
  default writes.
- Route: authorization, validation, success response, missing target, RPC
  failure, and proof that no separate clear query runs.

## Done criteria

- [ ] At most one active default can exist per workspace.
- [ ] Default transitions commit all changes or none.
- [ ] Missing/failed updates preserve the prior default.
- [ ] Server-only grants and identity validation are covered.
- [ ] DB reset/typegen, tests, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if historical duplicates exist without operator disposition, product
requires exactly one default and therefore needs unset/archive replacement
semantics, or an active owner claims these routes or
migration artifacts.

## Maintenance notes

The unique index is the invariant; the transactional function is the friendly
serialization and error boundary. Keep future default changes on that path.
