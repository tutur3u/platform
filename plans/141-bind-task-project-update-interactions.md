# Plan 141: Bind Task Project-Update Interactions to the Route Workspace

> **Executor instructions:** Make every comment and reaction operation prove the
> complete `workspace -> project -> update -> comment` path before reading or
> mutating data. Run every gate; stop instead of widening scope.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/comments/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/comments/[commentId]/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/reactions/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/attachments/route.ts' tmp/agent-coordination`
> The update and attachment handlers plus coordination notes are read-only
> evidence. Stop on contract or ownership drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Tasks typecheck failed twice on TS7053 errors in
  the new test builders; the scoped implementation and 38 passing focused tests
  are retained in `.worktrees/fix-task-update-interaction-workspace`
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / bug
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

These routes authorize membership only in caller-selected `wsId`, then use the
Tasks app-session's admin-backed Supabase client. A user who belongs to any
workspace can therefore read or write comments/reactions for a known update in
another workspace; comment owners can also edit/delete an old comment after
losing access to its real workspace.

## Current state

- `comments/route.ts:26-100,126-179` ignores `projectId` and checks no update
  parent before POST or GET.
- `comments/[commentId]/route.ts:27-96,136-192` loads and mutates by comment ID
  alone after unrelated route-workspace membership.
- `reactions/route.ts:21-73,115-172` inserts/deletes by `updateId` without
  checking its project or workspace.
- `apps/tasks/src/lib/app-session-user.ts:99-106` starts app sessions from an
  admin client; `packages/auth/src/app-session.ts:717-742` replaces only auth
  methods, so RLS is not the app-session boundary.
- The sibling update handler at `updates/[updateId]/route.ts:85-99` is the
  exemplar: it binds update ID, project ID, and joined project workspace before
  mutation. The attachment route also validates both parents at lines 46-77.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused routes | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/comments/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/comments/[commentId]/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-projects/[projectId]/updates/[updateId]/reactions/route.test.ts'` | all cases pass |
| Tasks typecheck | `bun run --cwd apps/tasks type-check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the three route files above; three new colocated route tests; an
optional focused helper under the same `updates/[updateId]/` subtree; README
status only.

**Out of scope:** the main update/attachment handlers, app-session engine, RLS,
schema/migrations, UI, response shapes, Web/Rust/TanStack artifacts.

## Git workflow

Use `fix/task-update-interaction-workspace`, run `bun setup`, and commit
`fix(tasks): bind update interactions to workspace`. Claim/release the commit
window; do not push unless instructed.

## Steps

### Step 1: Freeze the authorization boundary

Add injectable route tests for cookie and Tasks app-session actors. For every
method cover: unauthenticated; route membership failure; membership lookup
failure; foreign project; update belonging to another project; project in
another workspace; missing/deleted update; and authorized success. Item tests
must also reject a comment from another update before parsing/mutation. Assert
denials perform no comment/reaction read or mutation.

**Verify:** the focused command fails on the foreign-parent cases while existing
success codes and envelopes are characterized.

### Step 2: Scope the parent once before child work

Normalize `wsId`, resolve the actor, verify route membership, then query
`task_project_updates` by `id = updateId`, `project_id = projectId`,
`deleted_at IS NULL`, and joined `task_projects.ws_id = normalizedWsId`.
Return the same non-enumerating 404 for every parent mismatch. Run this guard
before body parsing and before any child query. Reuse one small helper only if
it keeps every edited file below 700 lines.

**Verify:** focused collection/reaction tests pass their foreign-workspace,
cross-project, cookie, and app-session matrices.

### Step 3: Bind comment item operations through the route update

Load the comment with both `id = commentId` and `update_id = updateId`, retain
creator-only PATCH/DELETE behavior, and keep those predicates on the final
mutation. A mismatched or deleted comment returns 404 without disclosing where
it belongs.

**Verify:** the focused item suite passes and proves a comment owner cannot use
an unrelated authorized workspace/project/update path.

### Step 4: Run all gates

Run focused tests, typecheck, the real Tasks build, `bun check`, and whitespace.
Confirm only scoped files plus the executor-owned README row changed.

## Done criteria

- [ ] Every comment/reaction method binds workspace, project, and update before child access.
- [ ] PATCH/DELETE additionally bind the comment to the route update and creator.
- [ ] Cookie and Tasks app-session tests cover authorized and dual-workspace denial cases.
- [ ] No denial parses the body or invokes a child mutation.
- [ ] All commands pass and no out-of-scope files changed.

## STOP conditions

Stop if an active note claims an exact route/test, response contracts drift,
the app-session client is no longer admin-backed, the fix requires schema/RLS
changes, or a mandatory gate fails twice.

## Maintenance notes

RLS remains defense in depth for cookie sessions, but app-session routes must
carry explicit tenant predicates. Review future nested project-update routes
for the full parent chain rather than trusting IDs independently.
