# Plan 071: Persist Task Description Representations Atomically

> **Executor instructions:** Make one logical description save update the plain
> description and Yjs state in one actor-aware database call. Run every gate;
> stop rather than inventing a new persistence contract.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/tasks-api/src/server/tasks/taskId/description/route.ts packages/tasks-api/src/server/tasks/taskId/description/route.test.ts apps/tasks/src/app/api/v1/workspaces/[wsId]/tasks/[taskId]/description/route.ts apps/database/supabase/migrations/20260321053000_fix_task_description_yjs_state_rpc_persistence.sql`
> Quote bracketed paths in an interactive shell. Stop on persistence-contract
> drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Tasks production build repeatedly fails in the
  current execution environment with Turbopack `EPERM` while creating its CSS
  worker process/internal port; reviewed uncommitted work remains in
  `.worktrees/fix-task-description-atomic-persistence`
- **Priority:** P1
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** Correctness / data integrity
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

A description save currently commits the plain string before separately writing
its collaborative Yjs representation. If the second write fails, the client
receives a failure while the two persisted representations disagree. One
actor-aware RPC call must be the commit boundary for both fields.

## Current state

- `packages/tasks-api/src/server/tasks/taskId/description/route.ts:290-339`
  derives both normalized values, sends only `description` through
  `update_task_fields_with_actor`, then writes `description_yjs_state` through a
  separate admin update.
- `route.test.ts:440-469` explicitly characterizes the partial failure: the RPC
  succeeds, the Yjs update fails, and the route returns 500.
- `apps/database/supabase/migrations/20260321053000_fix_task_description_yjs_state_rpc_persistence.sql:76-99`
  shows that `update_task_fields_with_actor` already accepts a JSON update
  object and delegates to the task updater that supports Yjs state. No schema
  migration is expected.
- The Tasks app route is a thin re-export of this package handler; preserve its
  request and response contract.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Inspect active
notes and confirm no exact-path owner appeared. Run `git status --short` and do
not touch unrelated dirty files.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun run --cwd packages/tasks-api test -- src/server/tasks/taskId/description/route.test.ts` | all description route tests pass |
| Package types | `bun run --cwd packages/tasks-api type-check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Repository gate | `bun check` | exit 0, or only a documented unrelated pre-existing blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/tasks-api/src/server/tasks/taskId/description/route.ts`
- `packages/tasks-api/src/server/tasks/taskId/description/route.test.ts`
- `plans/README.md` only for the status row

Do not change the public body/response schema, chunk protocol, database
functions, generated wrappers, or generated database types.

## Git workflow

- Branch: `fix/task-description-atomic-persistence` in an isolated worktree;
  run `bun setup` immediately.
- Commit: `fix(tasks): persist description representations atomically`.
- Do not push or open a PR unless instructed. Claim the commit window before
  staging.

## Steps

### Step 1: Lock the failure contract with tests

Extend the existing direct and chunked PATCH cases. Assert that a logical save
issues exactly one `update_task_fields_with_actor` call whose
`p_task_updates` contains both `description` and `description_yjs_state`. Model
an RPC failure and prove no second task-table mutation runs. Retain the current
chunk-session behavior: failed commit leaves the session resumable; successful
commit deletes it only after persistence succeeds.

### Step 2: Make the actor RPC the only write boundary

In `persistTaskDescriptionUpdate`, construct one update object from the fields
that are defined. When a description is supplied without an explicit Yjs
state, include the derived state in that same object. Call the actor-aware RPC
once, normalize its returned row, and remove the separate
`persistTaskDescriptionYjsState` path only if no other caller remains. Preserve
validation, null normalization, idempotent read-back, response status, and
actor attribution.

### Step 3: Verify the re-exported production surface

Run focused tests, package typecheck, the real Tasks build, then `bun check`.
Inspect the final diff to prove only the shared handler/test and index status
changed.

## Test plan

- Plain description derives Yjs state and submits both in one RPC.
- Explicit valid Yjs state and description submit together.
- Yjs-only saves remain supported without inventing a description value.
- RPC failure changes neither representation and returns the existing 500.
- Direct and chunked successes return the persisted pair.
- Chunked failure keeps the resumable session; success cleans it up.

## Done criteria

- [ ] No logical save performs two task-row writes.
- [ ] Both representations are present in one actor-aware RPC payload.
- [ ] Direct/chunked atomicity and idempotent read-back tests pass.
- [ ] Tasks API typecheck, Tasks build, `bun check`, and whitespace pass.
- [ ] No migration, public contract, or unrelated file changed.

## STOP conditions

Stop if the actor RPC no longer accepts `description_yjs_state`, the two fields
cannot be updated atomically without a migration, another live caller requires
the removed helper, an active note claims an in-scope path, or a required gate
fails twice after a reasonable correction.

## Maintenance notes

Treat the plain and collaborative description forms as one persisted value.
Future editor formats must join this same atomic update boundary rather than
adding another follow-up write.
