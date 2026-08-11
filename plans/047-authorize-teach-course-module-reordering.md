# Plan 047: Authorize Teach Course Module Reordering

> **Executor instructions:** Add the same `manage_users` permission gate used by
> neighboring Teach course/module mutations before the admin reorder RPC.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/teach/src/app/api/v1/workspaces/'[wsId]'/courses/'[courseId]'/module-order apps/teach/src/app/api/v1/workspaces/'[wsId]'/course-modules/'[moduleId]'/route.ts apps/teach/src/app/api/v1/workspaces/'[wsId]'/user-groups/'[groupId]'/module-order/route.ts`
> Stop if the neighboring permission contract changed.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `5c7225de1f6b2a420aa4710f0cbd14a09f13dd07`
  on branch `fix/teach-course-module-order-permission`; focused tests, Teach
  typecheck/build, `bun check`, whitespace, and hooks passed
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** Security / Authorization
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

An ordinary workspace member, including a learner, can reorder every module in
a course through an admin-backed RPC and change the learning sequence for all
participants.

## Current state

- The course module-order PATCH checks only workspace membership.
- It validates course/workspace and module completeness, then invokes
  `reorder_workspace_course_modules` through an admin client.
- Parallel module and group-order routes require `manage_users`.
- A colocated route test already covers payload validation and successful order,
  but not permission denial.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Confirm the
education extraction note remains terminal and no new Teach owner claims the
route. Reuse the established permission helper and response contract.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route test | `bun --cwd apps/teach vitest run 'src/app/api/v1/workspaces/[wsId]/courses/[courseId]/module-order/route.test.ts'` | all cases pass |
| Teach typecheck | `bun run --cwd apps/teach type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Teach build | `bun run --cwd apps/teach build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/teach/src/app/api/v1/workspaces/[wsId]/courses/[courseId]/module-order/route.ts`
- Its colocated `route.test.ts`

Do not change module ordering, RPC semantics, membership reads, or other Teach routes.

## Git workflow

- Branch: `fix/teach-course-module-order-permission` in an isolated worktree;
  run `bun setup` immediately.
- Conventional Commit: `fix(teach): authorize course module reordering`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Gate before privileged work

Resolve workspace permissions after membership succeeds and before request-body
processing or `createAdminClient`. Require `manage_users`, matching the adjacent
module-management routes, and return their established 403 response.

### Step 2: Extend the existing test harness

Mock the permission resolver. Prove a member without `manage_users` receives
403 and neither the admin client nor reorder RPC is invoked. Preserve existing
invalid, complete-order, and success cases; prove a manager reaches the RPC.

## Done criteria

- [ ] Ordinary members cannot reorder course modules.
- [ ] Authorized course managers retain the current behavior.
- [ ] Denied requests never instantiate the admin mutation path.
- [ ] Focused test, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if a different explicit course-management permission has replaced
`manage_users`, or active ownership overlaps the route.

## Maintenance notes

Course structure mutations must share one documented permission boundary; do
not treat workspace membership as edit authority.
