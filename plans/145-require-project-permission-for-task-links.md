# Plan 145: Require Project Permission for Task Links

> **Executor instructions:** Require `manage_projects` for adding or removing a
> task from a project at both the Tasks route and database policy boundaries.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/tasks/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/tasks/[taskId]/route.ts' apps/database/supabase/migrations apps/database/supabase/tests tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Blocked by:** the retained implementation predates reviewed Plan 151 and
  must be replayed onto `132a9e3ebb` to use disposable validation; the mandatory
  full exact-base pgTAP baseline is still red on five unrelated suites, as
  confirmed while executing Plan 150. The scoped implementation and 14 passing
  route tests remain in `.worktrees/fix-authorize-project-task-links`; its
  migration has not been applied and no commit was created
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security
- **Depends on:** none; use a uniquely named policy-only migration and do not
  regenerate database types
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The two project-task link mutations accept any workspace member before crossing
an admin/RPC boundary. The direct table write policy has the same membership-
only rule even though neighboring project mutations and Mira's tool contract
require `manage_projects`. Ordinary members can therefore reorganize shared
projects without the intended capability.

## Current state

- Collection POST checks membership at `tasks/route.ts:289-305`, parses the
  task, creates an admin client, and invokes `link_task_project_with_actor`.
- Item DELETE repeats the membership-only boundary at `tasks/[taskId]/route.ts:
  41-59` before invoking `unlink_task_project_with_actor`.
- The project route checks `manage_projects`; Mira metadata assigns that same
  permission to both add/remove project-task tools.
- `task_project_tasks` keeps a member-readable SELECT policy and a member-
  writable `FOR ALL` policy. This is a policy-only change: generated types must
  remain byte-identical.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Re-read root and Tasks/database `AGENTS.md`. Create an
isolated worktree at the planned SHA, run `bun setup` immediately, and restore
setup-only lockfile drift. Recheck active notes; STOP on an exact route or the
new uniquely named migration/test path owner.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/tasks/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/tasks/[taskId]/route.test.ts'` | permission matrix passes |
| Focused DB | `bun --cwd apps/database scripts/run-supabase.js test db supabase/tests/task-project-task-permission.sql` | member read and permissioned writes pass |
| Full DB | `bun --cwd apps/database scripts/run-supabase.js test db` | all pgTAP files pass |
| Apply | `bun sb:up` | unique policy migration applies locally |
| Type drift | `git diff --exit-code -- packages/types/src/supabase.ts` | no generated-type change |
| Tasks typecheck | `bun run --cwd apps/tasks type-check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the two Tasks mutation routes; two colocated tests; one additive,
uniquely named RLS policy migration; one focused pgTAP file.

**Out of scope:** GET response behavior, project/task schemas, RPC signatures,
generated types, task-project UI, cycle/initiative authorization, Web/Rust/
TanStack routes, and unrelated policies.

## Git workflow

Use `fix/authorize-project-task-links` and commit
`fix(tasks): authorize project task links`. Claim/release the commit window; do
not push or apply production migrations.

## Steps

### Step 1: Characterize the permission boundary

Add route tests for unauthenticated, membership lookup failure, nonmember,
ordinary member without `manage_projects`, permission lookup failure, and an
authorized manager. POST denials must occur before body parsing/admin creation;
DELETE denials before admin creation. Preserve project/task containment, 404,
409, actor attribution, and app-session behavior.

**Verify:** both focused route suites fail only for the missing permission gate.

### Step 2: Gate both mutations

After successful membership, call the app-session-safe
`getPermissions({ user, wsId })` contract with the already resolved actor and
require `manage_projects`. Do not copy the sibling route's request-only lookup:
that would re-resolve cookie auth and can reject or misattribute a valid Tasks
app-session actor. Normalize the workspace once and use it consistently. Return
the established 403 envelope; do not weaken existing containment checks.

**Verify:** focused route suites pass and denial tests prove zero privileged
work.

### Step 3: Align the database write policy

Create the migration with
`bun sb:new require_manage_projects_for_task_project_links`. Drop only the
membership-only write policy and recreate INSERT/UPDATE/DELETE policies using
the repository's current `has_workspace_permission(..., 'manage_projects')`
pattern through the linked project's workspace. INSERT and UPDATE `WITH CHECK`
must independently resolve the task workspace through
`tasks.list_id -> task_lists.board_id -> workspace_boards.ws_id`, require it to
equal `task_projects.ws_id`, and require the actor's `manage_projects` in that
same workspace. UPDATE `USING` and DELETE `USING` must authorize the existing
row through the project workspace; UPDATE must not be able to move either
foreign key outside the two-parent equality check. Preserve the existing member
SELECT policy. Preserve the two actor RPCs as `SECURITY INVOKER`: authenticated
RPC calls must therefore cross the tightened table policy, while the route's
service-role call remains guarded by the explicit actor permission check. Do
not change grants or RPC signatures.

Add pgTAP cases for member SELECT, denied ordinary-member direct
insert/update/delete, denied ordinary-member invoker-RPC link/unlink,
authorized operations through both direct writes and the RPCs, cross-workspace
denial with a local task plus foreign project, separate denial with a foreign
task plus local project, attempted UPDATE foreign-key movement, and service-role
behavior.

**Verify:** apply the migration and run focused pgTAP; generated types have no
diff.

### Step 4: Run mandatory gates

Run focused/full DB tests, route tests, typecheck, Tasks production build,
`bun check`, and whitespace. A pre-existing full-DB failure may be reported only
after the new focused suite passes and the exact unrelated baseline is proven;
the plan remains uncommitted if a mandatory gate cannot pass.

## Done criteria

- [ ] Both route mutations require `manage_projects` before privileged work.
- [ ] Member-readable SELECT remains unchanged.
- [ ] Direct authenticated writes require `manage_projects` and remain tenant scoped.
- [ ] The database rejects both foreign-project and foreign-task link pairs.
- [ ] Authenticated invoker-RPC calls cannot bypass the tightened write policy.
- [ ] Cookie/app-session success and every denial path are tested.
- [ ] Migration applies with no generated-type drift and all mandatory gates pass.

## STOP conditions

Stop on exact ownership, route/RPC contract drift, absence of a stable
permission helper, non-policy typegen drift, local migration mismatch,
unrelated destructive database repair, or the same mandatory gate failing
twice.
