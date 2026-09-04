# Plan 046: Require Project Permission for Task Planning Mutations

> **Executor instructions:** Preserve member-readable planning data, but require
> `manage_projects` for every cycle, initiative, and initiative-project write at
> both the route and direct-database boundaries.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/tasks/src/app/api/v1/workspaces/'[wsId]'/task-initiatives apps/tasks/src/app/api/v1/workspaces/'[wsId]'/task-cycles apps/database/supabase/migrations apps/database/supabase/tests apps/backend/src/workspaces_wsid_task_initiatives.rs`
> Stop on material permission, ownership, or policy drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Security / Authorization / RLS
- **Depends on:** generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while active Mail and Zalo lanes retain generated database
type ownership. The exact Tasks routes do not overlap the current Tasks
production note, but this plan's policy migration still requires typegen.

## Why this matters

Any workspace member can currently create, edit, delete, link, or unlink task
cycles and initiatives. Those mutations shape shared project planning and are
supposed to require `manage_projects`.

## Current state

- The six route files under `task-initiatives` and `task-cycles` authorize only
  membership before their mutations; initiative routes then use an admin client.
- Historical policies in `20250929042000_add_notes.sql` and
  `20250929060000_add_task_cycles.sql` grant authenticated members write access
  to the base and junction tables.
- Neighboring task-project routes call `getPermissions(...).containsPermission('manage_projects')`.
- `apps/docs/platform/architecture/tanstack-rust-migration.mdx` records
  `manage_projects` as the legacy contract for project/cycle/initiative writes.
- The Rust initiative handler owns GET only. Keep member-readable GET behavior
  and non-GET fallback unchanged.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Inspect the working Tasks production note; its
exact route ownership must remain non-overlapping. Read database `AGENTS.md`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-initiatives/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-initiatives/[initiativeId]/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-initiatives/[initiativeId]/projects/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-initiatives/[initiativeId]/projects/[projectId]/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-cycles/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-cycles/[cycleId]/route.test.ts'` | every mutation handler proves the permission boundary |
| Database apply | `bun sb:up` | migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | focused policy tests pass |
| Type generation | `bun sb:typegen` | generated types remain current |
| Tasks typecheck | `bun type-check:tasks` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- The six route files under the two named Tasks route trees
- Focused colocated route tests
- One additive migration replacing write policies for `task_initiatives`,
  `task_project_initiatives`, `task_cycles`, and `task_cycle_tasks`
- Focused pgTAP coverage and generated database types if typegen changes them

Do not restrict SELECT, change task-project semantics, or port mutations to Rust.

## Git workflow

- Branch: `fix/tasks-planning-permissions` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(tasks): authorize planning mutations`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging and never stage coordination notes.

## Steps

### Step 1: Add the route permission guard

After normalized workspace/session authorization and before parsing or admin
mutation, resolve permissions using the established Tasks helper and require
`manage_projects`. Apply it to POST, PUT/PATCH, DELETE, link, and unlink paths.

### Step 2: Align RLS write policies

Create an additive migration that preserves member-readable SELECT policies but
replaces mutation policies with `public.has_workspace_permission(...,
'manage_projects')`. Give UPDATE both `USING` and `WITH CHECK`; scope junction
checks through the owning cycle/initiative/project workspace.

### Step 3: Prove both boundaries

Create the six named route-test files. Each must show a member without the
permission receives 403 before mutation and a manager reaches its intended
write; do not infer item/link coverage from collection-route tests. pgTAP must
show direct authenticated writes fail without permission and pass for managers,
including junction insert/delete.

## Done criteria

- [ ] Every planning mutation requires `manage_projects`.
- [ ] Read access remains available to ordinary workspace members.
- [ ] Direct database writes cannot bypass the same permission.
- [ ] Focused tests, local migration, typegen, checks, build, and whitespace pass.

## STOP conditions

Stop if product policy intentionally lets every member manage planning objects,
historical data violates the workspace relationships needed by the new policies,
or an active note claims an exact scoped path.

## Maintenance notes

Keep the route guard for clear API errors even though RLS is the final direct
client boundary. Do not change the GET-only Rust ownership in this plan.
