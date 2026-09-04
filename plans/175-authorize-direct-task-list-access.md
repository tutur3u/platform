# Plan 175: Authorize Direct Task-List Access by Board Actor

> **Executor instructions:** Replace the actor-ignoring task-list RLS helper
> with board-scoped read/edit authorization that matches the maintained Tasks
> API, and prove direct authenticated writes cannot bypass board permissions.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/tasks-api/src/server/board-access.ts packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** HIGH
- **Category:** security / authorization / database
- **Depends on:** Plans 154 and 163 (DONE); broad Tasks and
  database/generated-type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The active `task_lists` policy calls a `SECURITY DEFINER` helper that ignores
its user argument and returns true whenever the board exists. Because
authenticated users retain direct table privileges, any signed-in actor who
knows a board id can read, create, rename, move, or delete its lists; deletion
can cascade into tasks.

## Current state

- `20240501095759_remote_schema.sql:746` defines
  `is_task_board_member(_user_id,_board_id)` by checking only that the board id
  exists.
- `20260701070408_wrap_rls_perf_initplan.sql:466-468` uses that helper for both
  `USING` and `WITH CHECK` on the all-operations task-list policy.
- Authenticated actors have direct task-list CRUD privileges.
- `resolveTaskBoardAccess` allows members to view, requires `manage_projects`
  for member edits, and honors explicit board shares at `view` or `edit`.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Execute from completed
Plan 151/163 infrastructure only after Plan 154 is green. Read root/database
AGENTS and the canonical TypeScript board-access helper before writing SQL.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/task-list-board-access.sql` | full actor/operation matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/task-list-board-access.sql` | types reflect only intentional helper changes |
| Tasks API | `bun run --cwd packages/tasks-api type-check` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one unique additive migration replacing the insecure helper/policy;
`task-list-board-access.sql`; generated types only if the approved helper is
exposed; read-only characterization of board access and share tables.

**Out of scope:** Tasks route response changes; list UX; task mutation policies;
changing board-share semantics; production apply; repairing unrelated pgTAP.

## Git workflow

Use `fix/authorize-task-lists` from the Plan 151/154/163 integration base and
commit `fix(tasks): authorize direct task list access`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Catalog every current overload, grant, policy, and caller of
   `is_task_board_member`. Fail if another table depends on its insecure
   semantics; replace all security-sensitive callers in the same migration.
2. Define one fixed-search-path board-access decision for the current
   `auth.uid()`. Read access must require a non-deleted board plus workspace
   creator/member status or a matching user/email share with `view` or `edit`.
   Write access must require a creator/member with `manage_projects` or an
   explicit `edit` share. A default permission must not authorize a nonmember.
3. Replace the all-operations policy with separate SELECT and mutation policies.
   UPDATE must check both the old and new board; INSERT checks the destination;
   DELETE checks the stored board. Revoke obsolete helper execution where it is
   no longer required.
4. Add pgTAP cases for manager, ordinary member, view share, edit share,
   normalized email share, nonmember, deleted board, foreign board, list moves,
   and each CRUD operation. Prove a denied list delete leaves its tasks intact.
5. Apply/test in the disposable stack, run full pgTAP after Plan 154, generate
   types from that same stack, and run package/repository gates.

## Done criteria

- [ ] No task-list policy uses an actor-ignoring existence check.
- [ ] SELECT and write semantics match the maintained member/share contract.
- [ ] Old and new board containment is enforced for list moves.
- [ ] Unauthorized delete cannot trigger task cascades.
- [ ] Focused/full DB, isolated typegen, Tasks API, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, undocumented helper callers, inability to match the
canonical share/email contract, unexpected generated-type drift, a red Plan 154
baseline, default-stack mutation, or a mandatory gate failing twice.
