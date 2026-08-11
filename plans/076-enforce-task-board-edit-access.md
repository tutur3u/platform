# Plan 076: Enforce Task Board Edit Access

> **Executor instructions:** Route board updates and deletes through the same
> canonical edit-access policy as reads, and replace mass assignment with a
> strict update allowlist. Do not execute through active Tasks ownership.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/route.test.ts' packages/tasks-api/src/server/board/boardId/route.ts packages/tasks-api/src/server/board/boardId/route.test.ts packages/tasks-api/src/server/board-access.ts packages/tasks-api/src/server/board-access.test.ts`
> Stop on access-policy or mutation-contract drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Security / authorization
- **Depends on:** Tasks production/release ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Board GET uses the canonical board-access resolver, but PUT and DELETE fall
back to workspace membership and service-role writes. An ordinary member can
therefore mutate or delete a board without `manage_projects`, and PUT forwards
undeclared body keys into the update payload.

## Current state

- `apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/route.ts:202-286`
  calls `requireBoardAccess` for GET but delegates PUT/DELETE without an edit
  decision.
- `packages/tasks-api/src/server/board/boardId/route.ts:189-227` checks only
  membership, casts unvalidated JSON, and spreads remaining keys into the
  service-role update.
- The same shared file's DELETE path at `:326-353` checks only membership.
- `packages/tasks-api/src/server/board-access.test.ts:140-176` already defines
  the intended edit boundary: deny a member without `manage_projects`, while
  allowing an explicit edit share.
- Active notes claim broad `apps/tasks/**` work. This plan remains blocked until
  those owners release or explicitly transfer the exact route/test paths.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Inspect all active
Tasks notes, run `git status --short`, and do not edit until exact ownership is
clear. Preserve cookie and Tasks app-session actors.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Shared handler tests | `bun run --cwd packages/tasks-api test -- src/server/board/boardId/route.test.ts src/server/board-access.test.ts` | denial, edit-share, allowlist, and success cases pass |
| Tasks route tests | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/route.test.ts'` | route adapter and both mutation methods pass |
| Package types | `bun run --cwd packages/tasks-api type-check` | exit 0 |
| Tasks app types | `bun run --cwd apps/tasks type-check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Repository gate | `bun check` | exit 0, or only a documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/tasks-api/src/server/board/boardId/route.ts`
- `packages/tasks-api/src/server/board/boardId/route.test.ts` (create if absent)
- `apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/route.ts`
- `apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/route.test.ts`
- `packages/tasks-api/src/server/board-access.ts` and its test only if a shared
  injectable edit-decision type is required
- `plans/README.md` only for status

Do not change board GET shape, app-session audiences, database policies, board
sharing semantics, list defaults, or unrelated Tasks UI.

## Git workflow

Use branch `fix/task-board-edit-access` in an isolated worktree and run
`bun setup`. Commit `fix(tasks): enforce board edit access`. Claim the commit
window before staging; do not push unless instructed.

## Steps

### Step 1: Establish the denial matrix

Use the existing direct Vitest invocation in the command table. Add cases for
cookie and every app-session audience actually configured by the route,
ordinary member, manager, direct read share, direct edit share, missing board,
and cross-workspace board ID. Do not invent a new satellite audience.

### Step 2: Pass a canonical edit decision into shared mutations

Keep the shared Tasks API handler reusable by adding an explicit injectable
board-access dependency/context. The Tasks route adapter must call its existing
canonical resolver with `requiredPermission: 'edit'` before either mutation.
The shared handler must fail closed when that decision is missing; do not
silently retain membership-only authorization for direct callers.

### Step 3: Strictly parse and construct board updates

Replace the body cast/spread with a strict Zod schema. Permit only the currently
supported fields: `name`, `icon`, `ticket_prefix`, the three default-list IDs,
`archived`, `deleted`, `restore`, and `group_ids` if its existing behavior is
retained. Construct `BoardUpdatePayload` explicitly. Reject unknown keys with
400 before any admin query, and preserve default-list ownership validation and
rollout fallback.

### Step 4: Verify both request identities and destructive paths

Run shared and app route suites, both typechecks, the real Tasks build, and
`bun check`. Inspect the final diff for unrelated Tasks work.

## Test plan

- Member without edit permission receives 403 for PUT and DELETE; admin client
  mutation is not called.
- `manage_projects` and explicit edit-share actors retain access; read-only
  shares do not.
- Unknown or protected fields (`ws_id`, `creator_id`, ordering/template fields)
  receive 400 and never reach the update.
- Cross-workspace/missing boards remain non-mutable.
- Cookie and allowed app-session identities use the same object-level policy.
- Default-list validation, unique-name errors, archive/restore, and delete
  responses remain compatible.

## Done criteria

- [ ] PUT and DELETE cannot run without canonical edit access.
- [ ] The update payload is strict and explicitly allowlisted.
- [ ] Manager/edit-share success and member/read-share denial are proven.
- [ ] Focused tests, types, Tasks build, `bun check`, and whitespace pass.
- [ ] No active Tasks owner was bypassed and no unrelated file was changed.

## STOP conditions

Stop if ownership remains active, the app-session audience is ambiguous, the
canonical resolver cannot be injected without changing public contracts, an
existing client depends on undeclared fields, or a required gate fails twice.

## Maintenance notes

All board mutations must share one object-level access policy. TypeScript casts
must never be treated as an admin-write allowlist.
