# Plan 150: Authorize Task Relationship Mutations

> **Executor instructions:** Keep task relationships readable to authorized
> viewers, but require edit access to both task boards for creation/deletion and
> tighten direct authenticated database writes.
>
> **Drift check (run first):**
> `git diff --stat 132a9e3ebb..HEAD -- packages/tasks-api/src/server/board-access.ts 'packages/tasks-api/src/server/tasks/taskId/relationships/route.ts' 'packages/tasks-api/src/server/tasks/taskId/relationships/route.test.ts' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory full isolated pgTAP failed twice on unrelated
  exact-base suites (`ai-studio-credit-observability`, `ai-studio-foundations`,
  `description-table-hardening`, `private-schema-workspace-wallets`, and
  `tulearn-learner-app`). The route/policy implementation and focused 18-case
  database suite are retained in `.worktrees/fix-authorize-task-relationships`;
  the route suite was 9/9 before two final denial cases were added and must be
  rerun when resuming. No commit was created.
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security
- **Depends on:** reviewed Plan 151 commit `132a9e3ebb`
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from `132a9e3ebb`

## Why this matters

Relationship POST and DELETE stop at workspace membership before writing with
the admin client. Ordinary members without `manage_projects` can therefore
alter shared task dependency/parent graphs. The authenticated table policies
also use membership only, even though the canonical board-access contract
distinguishes view from edit and supports explicit board edit shares.

## Current state

- Both mutation handlers authenticate, normalize the workspace, verify only
  membership, parse the relationship, tenant-check both tasks, then use the
  service-role client to insert/delete.
- `resolveTaskBoardAccess(..., requiredPermission: 'edit')` already grants edit
  to `manage_projects` members or explicit board-edit guests and is used by
  maintained task mutation routes.
- Relationship RLS permits member INSERT/UPDATE/DELETE; SELECT should remain
  readable under the established task visibility rules.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root plus Tasks/database `AGENTS.md`. Create the
isolated worktree at reviewed Plan 151 commit `132a9e3ebb` and run `bun setup`
immediately. Recheck the Tasks production note, Plan 145 retained worktree, and
migration owners; use Plan 151's disposable validator rather than the shared
default stack.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun run --cwd packages/tasks-api test -- src/server/tasks/taskId/relationships/route.test.ts` | access matrix passes |
| Board access | `bun run --cwd packages/tasks-api test -- src/server/board-access.test.ts` | member/share behavior remains green |
| Focused DB/apply | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/task-relationship-permission.sql` | fresh exact-base stack applies migration and focused matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | fresh exact-base stack applies migrations and all pgTAP suites pass |
| Type drift | `git diff --exit-code -- packages/types/src/supabase.ts` | no generated-type change |
| Package typecheck | `bun run --cwd packages/tasks-api type-check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** relationship route and test; reuse or a narrow extension of the
existing board-access helper; one uniquely named policy-only migration; one
focused pgTAP suite.

**Out of scope:** GET response shape, relationship type semantics, task CRUD,
board-share creation, project-task links from Plan 145, generated types, UI,
Web/Rust/TanStack routes.

## Git workflow

Use `fix/authorize-task-relationships` and commit
`fix(tasks): authorize task relationships`. Claim/release the commit window;
do not push or apply production migrations.

## Steps

### Step 1: Characterize both-board edit access

Extend the focused route suite for unauthenticated, lookup failure, nonmember,
ordinary member without permission, `manage_projects` member, explicit edit-
share guest, view-only guest, and cross-board relationships. A mutation is
allowed only when the actor has edit access to both source and target boards.
Keep inaccessible tasks non-enumerating and preserve GET member/share behavior.

**Verify:** tests fail only for the missing mutation authorization.

### Step 2: Gate POST and DELETE through canonical board access

Load each task once through its list/board context, prove both normalized
workspace ids match the route, then call the existing app-session-safe
`resolveTaskBoardAccess` contract with `requiredPermission: 'edit'` for both
boards. Do not replace it with a raw membership or permission-only shortcut,
because explicit board edit shares are part of the current contract. Denials
must occur before insert/delete; keep existing validation and 404 envelopes.

**Verify:** focused route and board-access suites pass for cookie and Tasks
app-session actors; a share on only one board cannot mutate the pair.

### Step 3: Tighten direct authenticated write policies

Preserve the current relationship SELECT policy. Replace membership-only
INSERT/UPDATE/DELETE policies with same-workspace parent containment through
`tasks.list_id -> task_lists.board_id -> workspace_boards.ws_id` and
`has_workspace_permission(..., 'manage_projects')` for both task parents.
INSERT/UPDATE `WITH CHECK` must cover both new parents; UPDATE/DELETE `USING`
must authorize the stored parents. Direct board-share mutation remains routed
through the server-only board-access boundary; do not expose the private share
table or create a weaker security-definer helper merely to preserve direct REST
writes.

**Verify:** pgTAP separately covers foreign source, foreign target, ordinary
member, authorized manager, update parent movement, delete, member SELECT, and
service-role behavior.

### Step 4: Run mandatory gates

Apply the policy migration through Plan 151's exact-base disposable Supabase
validator, run
focused/full database and route tests, assert zero generated-type drift, then
run package typecheck, Tasks build, `bun check`, and whitespace.

## Done criteria

- [ ] POST and DELETE require edit access to both task boards.
- [ ] `manage_projects` members and explicit edit-share guests retain intended access.
- [ ] View-only/one-board access cannot alter a relationship.
- [ ] Direct authenticated writes require permission and both-parent containment.
- [ ] SELECT behavior and response envelopes remain compatible.
- [ ] All migration, test, build, and repository gates pass.

## STOP conditions

Stop on exact ownership, board-share contract drift, inability to validate both
parents without duplicate inconsistent reads, isolated-validator failure,
non-policy generated-type drift, destructive database repair, or the same
mandatory gate failing twice.
