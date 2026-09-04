# Plan 200: Copy Task Boards Atomically and Completely

> **Executor instructions:** Replace the route's staged board/list/task writes
> with one bounded, replay-safe transaction that either creates the complete
> copy or creates nothing.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/copy' packages/tasks-ui/src/tu-do/boards/copy-board-dialog.tsx packages/tasks-ui/src/tu-do/boards/copy-board-dialog.test.tsx packages/internal-api/src/tasks.ts packages/internal-api/src/tasks.test.ts packages/tasks-api apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / performance / data integrity
- **Depends on:** Plan 154 and completed Plan 163; Tasks plus database/generated-
  type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Copying a board currently inserts the board, attempts to remove trigger-created
lists, inserts copied lists, and inserts copied tasks as separate requests. A
later failure leaves a visible partial board, while a failed cleanup is merely
logged and copying continues. The nested source select also materializes the
entire board graph through PostgREST, exposing large boards to response caps.

## Current state

- `copy/route.ts:105-160` loads the source board with all lists/tasks, then
  commits the destination board.
- `20250608140008_add_task_statuses.sql:112-162`, later refreshed by
  `20260507142100_configure_review_task_list_status.sql`, automatically creates
  lists after each board insert.
- `copy/route.ts:175-185` deletes those lists through the session client and
  ignores failure. Lines 218-268 then independently insert lists and tasks,
  returning 500 without removing the already-created graph.
- The route has no colocated test. The UI calls it once and does not carry a
  replay/idempotency key.

## Exact behavior contract

- Same-workspace copies only; require `manage_projects` and canonical source
  board containment before privileged work for cookie and Tasks app-session
  actors.
- Accept a required request UUID (stable across client retry) plus the existing
  optional bounded name. The key is unique per workspace/actor/source board;
  same-key replay returns the original completed copy, while a different
  payload conflicts.
- In one transaction, lock/validate source metadata, create the destination,
  replace trigger-created lists, copy every nondeleted list and task set-wise,
  remap list IDs deterministically, and persist completion/idempotency state.
- Do not silently truncate a large board. Use set-wise SQL rather than a nested
  PostgREST materialization; define and test a generous explicit maximum only
  if the transaction needs one.
- Any failure leaves no destination board/list/task/idempotency residue.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$vercel-react-best-practices`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read Tasks/database
instructions. Obtain Tasks/database/type ownership, confirm Plan 154 is DONE,
and execute from completed Plan 163 in an isolated worktree with immediate
`bun setup`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/copy/route.test.ts'` | auth, replay, failure, and response cases pass |
| UI | `bun run --cwd packages/tasks-ui test -- src/tu-do/boards/copy-board-dialog.test.tsx` | one stable request key is retained across retry |
| Internal API | `bun run --cwd packages/internal-api test -- src/tasks.test.ts` | typed path/body/replay/error contract passes |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/task-board-copy.sql` | atomic graph-copy and replay matrix passes |
| Full database | `bun --cwd apps/database sb:validate:isolated` | every pgTAP suite passes |
| Type generation | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/task-board-copy.sql` | generated types match the new server contract |
| Typechecks | `bun run --cwd apps/tasks type-check && bun run --cwd packages/tasks-ui type-check && bun run --cwd packages/internal-api type-check` | all exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** copy route and new colocated test; copy dialog and a focused test;
typed helper/tests in `packages/internal-api/src/tasks.ts`; one additive
migration plus `task-board-copy.sql`; generated types; a narrowly typed shared
helper if needed.

**Out of scope:** cross-workspace copying, copying attachments/comments/labels/
assignees/projects, changing board creation generally, background jobs, UI
redesign, production apply.

## Concurrency-test method

The focused pgTAP file must use `extensions.dblink_connect` with one setup
connection and two named workers, connecting credential-free to the disposable
local database through
`format('dbname=%s user=%s', current_database(), current_user)`. The setup
transaction locks the
fixture source board before either RPC begins. Send both copy calls, assert both
workers are busy through `extensions.dblink_is_busy` behind that row-lock
barrier, then commit setup through `extensions.dblink_exec` and collect both
results through `extensions.dblink_get_result`.

Run two races: same request UUID/same payload must return the same completed
board from both calls with exactly one destination graph; same UUID/different
name must yield exactly one success and one stable conflict, regardless of
which worker wins, with exactly one graph. Add a test-only transaction-local
trigger that raises during copied-task insertion, prove the failed owner leaves
no board/list/task/operation row, remove the trigger, and prove retry with the
same UUID succeeds once. Exception cleanup must release setup first, drain or
disconnect workers, remove test objects, and then restore fixtures. Sleeps may
not be the sole overlap proof; no credentials or runner changes are allowed.

## Git workflow

Use `fix/atomic-task-board-copy` and commit
`fix(tasks): copy boards atomically`. Claim/release the commit window; do not
push.

## Steps

1. Characterize current auth/name/404/409/success envelopes and add red failure
   tests for trigger-list cleanup, copied-list insertion, copied-task insertion,
   duplicate requests, and a source above PostgREST's 1,000-row limit. Assert
   every failed attempt leaves zero destination graph.
2. Add the required request UUID to the typed UI request. Create it once per
   user copy action and retain it across manual retry; a new dialog action gets
   a new key. Add/use the typed internal-api helper instead of retaining the raw
   client fetch. Keep the UI's success/error behavior.
3. Add a private service-role-only transactional RPC with exact ACLs. Revalidate
   the route-authorized actor/workspace/source under lock, claim the request key,
   create/remap the graph set-wise, and settle the operation in the same
   transaction. Explicitly handle the board trigger's default lists.
4. Route both cookie and Tasks app-session calls through canonical
   `manage_projects` authorization, call the transaction once, map stable
   conflict/not-found errors, and return the stored replay result.
5. Implement the exact `dblink` same-key and changed-payload races plus the
   rollback/retry fault probe above. Then run route/UI/internal-api/pgTAP tests,
   full isolated database validation,
   typegen, typechecks, Tasks build, repository, and whitespace gates.

## Done criteria

- [ ] A copy produces the complete nondeleted board/list/task graph or nothing.
- [ ] Trigger-created lists cannot survive alongside copied lists.
- [ ] Same-key replay returns one board and changed-payload reuse conflicts.
- [ ] Two simultaneously blocked workers prove one graph under same-key replay
      and one winner under changed-payload reuse; failed ownership is retryable.
- [ ] Large sources are copied set-wise without silent PostgREST truncation.
- [ ] Cookie/app-session auth, focused/full tests, typegen, typechecks, build,
      repository, and whitespace gates pass.

## STOP conditions

Stop on unresolved ownership, Plan 154 not DONE, unclear copy scope, inability
to define stable retry identity, unavailable local `dblink`/independent
connections, need to copy a currently unsupported relation, unexpected
generated-type drift, or a mandatory gate failing twice.
