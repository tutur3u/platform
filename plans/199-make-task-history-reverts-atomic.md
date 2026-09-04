# Plan 199: Make Task History Reverts Atomic

> **Executor instructions:** Restore selected core fields and relationships as
> one actor-authorized transaction. Never report a successful historical state
> after a partial or unchecked mutation.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/tasks/[taskId]/revert' packages/tasks-ui/src/tu-do/shared/task-edit-dialog.tsx packages/tasks-ui/src/tu-do/shared/task-edit-dialog/hooks/use-task-revert.ts packages/tasks-ui/src/tu-do/shared/task-edit-dialog/hooks/__tests__ packages/tasks-ui/src/tu-do/shared/task-edit-dialog/task-snapshot-dialog.tsx packages/tasks-ui/src/tu-do/shared/task-edit-dialog/task-snapshot-dialog.test.tsx packages/utils/src/task-snapshot.ts packages/utils/src/task-snapshot.test.ts apps/tasks/src/lib/app-session-user.ts packages/tasks-api/src/server/board-access.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / data integrity / tests
- **Depends on:** Plan 154 and completed Plan 163; Tasks plus database/generated-
  type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The revert endpoint commits core fields first, then independently deletes and
reinserts three relationship sets while ignoring several query/mutation
errors. It can return 500 after a partial core update or return `success: true`
after losing assignees, labels, or projects. Concurrent edits are not locked.

## Current state

- `revert/route.ts:165-197` persists core fields before loading the
  relationship snapshot, so a later read failure leaves a partial revert.
- Lines 204-235 ignore current-assignee read errors and both relationship
  mutation results. Lines 238-315 repeat unchecked delete/insert flows for
  labels and projects.
- Lines 319-334 log final read failure but still return success and claim every
  requested field was reverted.
- The route directory has no test. Existing snapshot RPCs live in
  `20251206170000_add_task_snapshot_rpc.sql`; the current route also needs its
  cookie/app-session behavior characterized before choosing the RPC credential
  seam.

## Exact behavior contract

- Validate one bounded, duplicate-free list of known fields, a required
  `expectedTaskUpdatedAt`, and one historical record belonging to the route
  task/workspace. The hook captures that version from the displayed current
  task and preserves it for the one deliberate revert attempt.
- Resolve the authenticated Tasks actor for both cookie and Tasks app-session
  requests, require canonical edit access to the task's board, and reject
  before privileged work.
- Under one transaction and task-row lock, reconstruct the requested snapshot,
  validate the historical list/project/label/assignee parents against the route
  workspace, update only selected fields, and replace only selected relations.
- Any missing snapshot, authorization failure, invalid historical reference,
  stale/concurrent conflict, read error, or write error changes nothing.
- Success returns the committed task plus the exact deduplicated selected-field
  set. A failed final representation read is a failure, not success with null.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read Tasks/database instructions. Obtain the Tasks and
database/type transfers, confirm Plan 154 is DONE, and execute from completed
Plan 163 in a new worktree with immediate `bun setup`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/tasks/[taskId]/revert/route.test.ts'` | auth, validation, failure, and exact-result matrix passes |
| UI boundary | `bun run --cwd packages/tasks-ui test -- src/tu-do/shared/task-edit-dialog/hooks/__tests__/use-task-revert.test.ts src/tu-do/shared/task-edit-dialog/task-snapshot-dialog.test.tsx` | displayed expected version is sent and conflict behavior passes |
| Snapshot type | `bun run --cwd packages/utils test -- src/task-snapshot.test.ts` | current-state version contract passes |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/task-history-revert.sql` | transaction, containment, and lock assertions pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | complete pgTAP suite passes |
| Type generation | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/task-history-revert.sql` | generated types reflect only the new server boundary |
| Typechecks | `bun run --cwd apps/tasks type-check && bun run --cwd packages/tasks-ui type-check && bun run --cwd packages/utils type-check` | all exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** revert route plus new colocated test; `task-edit-dialog.tsx`,
`use-task-revert.ts`, `task-snapshot-dialog.tsx`, and focused tests for the
expected-version contract; add required `updated_at` to `CurrentTaskState` in
`packages/utils/src/task-snapshot.ts` with its focused test; one uniquely named
additive migration and focused pgTAP file; generated Supabase types; a narrowly
shared Tasks helper only if required for the existing board-edit contract.

**Out of scope:** changing history capture or UI; reverting attachments,
comments, dependencies, or other fields; automatic conflict retries; changing
ordinary task-update semantics; production apply.

## Concurrency-test method

The focused pgTAP file must create `dblink` if needed and call
`extensions.dblink_connect` with
`format('dbname=%s user=%s', current_database(), current_user)` for three named,
credential-free local connections: one setup connection plus `revert_worker`
and `edit_worker`. The setup connection
begins a transaction and locks the fixture task row. Send the ordinary edit
first with `extensions.dblink_send_query` and wait until
`extensions.dblink_is_busy('edit_worker') = 1`; then send the revert
with the pre-lock `expectedTaskUpdatedAt` and assert its worker is also busy.
Commit setup through `extensions.dblink_exec`, collect results through
`extensions.dblink_get_result`, and prove the
edit commits, the revert returns the stable stale-version conflict, and no
selected relationship changed. A second race with revert queued first may let
the later edit win, but must never lose the edit or create a mixed graph.

Wrap connection teardown and fixture cleanup in an exception block that first
rolls back/releases the setup transaction, drains or disconnects both workers,
and only then restores data. No credentials, external ports, sleeps as the sole
barrier, or runner modification are permitted. The pgTAP file is the executable
harness used by the focused/full isolated commands above.

## Git workflow

Use `fix/atomic-task-history-revert` and commit
`fix(tasks): make history reverts atomic`. Claim/release the commit window; do
not push.

## Steps

1. Add route characterization before production changes: unauthenticated,
   cookie/app-session success, view-only/foreign workspace denial, malformed or
   duplicate fields, missing history, each existing read/write failure, mixed
   core/relationship restoration, and failed final read. Assert no success is
   emitted after any dependency failure.
2. Add required `updated_at` to `CurrentTaskState`, populate it from the live
   task in `task-edit-dialog.tsx`, and pass it through the snapshot dialog/hook
   as `expectedTaskUpdatedAt`. The transaction compares it after taking the
   task-row lock and returns a stable 409 without mutation if another edit won.
   Implement the exact `dblink` barrier above for an edit committed while a
   revert waits on the lock. Do not enable the currently disabled revert UI as
   part of this plan.
3. Reuse the canonical board edit-access boundary and normalize the route
   workspace before creating/using a service-role helper. Preserve current 4xx
   envelopes where they are intentional; sanitize unexpected 500s.
4. Add one transaction boundary. Prefer a private, service-role-only RPC with
   explicit verified actor/workspace/task/history identifiers so Tasks app
   sessions do not depend on SQL `auth.uid()`. Revalidate actor and all parents,
   lock the task, restore the selected graph, and return the committed task.
   Apply exact signature ACL revokes/grant and test them.
5. Add deterministic pgTAP failure probes for core, each relationship set,
   foreign references, and the two-connection edit/revert races above. Every
   failure must leave before/after state identical; success must equal the
   selected snapshot while unselected fields remain current.
6. Run focused/full database validation, typegen, route/hook tests, Tasks typecheck
   and build, `bun check`, and whitespace.

## Done criteria

- [ ] A revert commits every selected core/relationship change or none.
- [ ] Cookie and Tasks app-session actors share the same edit boundary.
- [ ] Foreign historical parents and stale concurrent state fail closed.
- [ ] The real two-worker lock barrier proves a queued concurrent edit cannot
      be overwritten or produce a mixed historical graph.
- [ ] Success returns the exact committed state; no read/write error is ignored.
- [ ] Route/pgTAP/typegen/typecheck/build/repository gates pass.

## STOP conditions

Stop on unresolved ownership, Plan 154 not DONE, ambiguous snapshot semantics,
need to expand the revert field set, inability to authenticate app sessions at
the chosen database seam, unavailable local `dblink`/independent connections,
unsupported public response drift, or a mandatory gate failing twice.
