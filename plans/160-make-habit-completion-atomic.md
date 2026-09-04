# Plan 160: Commit Habit and Calendar Completion Together

> **Executor instructions:** Replace the two independent completion writes
> with one actor/workspace-bound database mutation. A successful response must
> mean the habit occurrence and every linked habit calendar event agree.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/habits/[habitId]/complete' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / tests / database
- **Depends on:** Plans 154 and 163; Tasks route ownership disposition;
  database migration and generated-type ownership
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from reviewed Plan
  151 commit `132a9e3ebb` after Plan 154 is DONE

## Why this matters

The completion route commits `habit_completions` first and ignores errors while
updating `habit_calendar_events`. It can report success while streak data and
the Calendar surface disagree, and overlapping complete/uncomplete requests
have no explicit serialization rule.

## Current state

- `.../habits/[habitId]/complete/route.ts:111-161` upserts or deletes the
  completion row, then performs an unchecked linked-event update.
- `habit_completions` and `habit_calendar_events` are separate tables with no
  synchronization trigger or transactional mutation.
- The route has no colocated test for the second-write failure, retry, or
  concurrent opposing mutations.
- The endpoint supports the Tasks app-session boundary; the new RPC must be
  private/service-role-only and receive the server-resolved actor/workspace,
  not trust a public caller-selected actor.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root, Tasks, and database `AGENTS.md`. Resolve the
top-level completed-but-unarchived invite/auth note's mention of this route and
obtain database/type ownership. Use Plan 151 disposable validation only.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/habits/[habitId]/complete/route.test.ts'` | all cases pass |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/habit-completion-atomic.sql` | atomicity/concurrency assertions pass |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/habit-completion-atomic.sql` | Plan 163 generates types from the same disposable migrated stack; only expected RPC drift remains |
| Tasks typecheck | `bun run --cwd apps/tasks type-check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | production build passes |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** completion route plus new colocated test; one uniquely named
private RPC migration and pgTAP file; generated types.

**Out of scope:** streak algorithm redesign, habit scheduling/history bounds,
Calendar event generation, UI copy, generic habit CRUD, or a public RPC callable
with a spoofed actor/workspace.

## Git workflow

Use `fix/atomic-habit-completion` and commit
`fix(tasks): commit habit completion atomically`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Add route characterization tests for complete, uncomplete, retry, no linked
   event, multiple linked events, and downstream failure.
2. Create a private/service-role-only function that locks the habit occurrence
   key, verifies habit/workspace containment, performs the completion and event
   update in one transaction, and returns the canonical completed state.
3. Revoke public/authenticated execution; grant only the service role. Have the
   route pass its already-resolved workspace/habit/occurrence values and map
   stable not-found/conflict/database results without leaking internals.
4. Add two-connection pgTAP coverage for overlapping complete/uncomplete calls
   with an explicit last-lock-acquirer result and zero contradictory rows.
5. Run focused/full database, typegen, route, typecheck, build, and repo gates.

## Done criteria

- [ ] A success response guarantees both tables reflect the returned state.
- [ ] Any internal failure rolls back both writes.
- [ ] Retry and concurrent opposing mutations have a tested deterministic rule.
- [ ] Public/authenticated callers cannot spoof the service-role RPC.
- [ ] Full database suite, generated types, Tasks build, and `bun check` pass.

## STOP conditions

Stop on ownership, failure to run a real two-connection test, unexpected legacy
mismatches, need to alter streak semantics, default-stack mutation, generated
type overlap, or any gate failing twice.
