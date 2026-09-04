# Plan 239: Require Board-Share Administration Permission

> **Executor instructions:** Keep direct guests' existing board view/edit
> capability, but never let a share grant bootstrap permission to create,
> mutate, or revoke other shares or public links.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/shares' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/public-link' packages/tasks-api/src/server/board-access.ts packages/tasks-api/src/server tmp/agent-coordination`

## Status

- **Execution status:** TODO
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / authorization / privilege separation
- **Depends on:** none; coordinate with adjacent Tasks work before editing
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The canonical board-access resolver treats a direct guest with `edit` as having
generic edit permission. Shares and public-link routes reuse that result for
administration, so an edit guest can create more grants, change or revoke
existing grants, and create/disable a public link. The current UI hides those
controls from guests, but the server boundary does not.

## Current state and exact contract

- Preserve member/share board view and edit behavior everywhere outside the two
  administration route families.
- Every shares/public-link GET, POST, PATCH, and DELETE requires both:
  1. an actual `workspace_members` row for the authenticated actor and route
     workspace; and
  2. `manage_projects` in that workspace.
- Direct view/edit guests, public-link viewers, ordinary members without
  `manage_projects`, and members of another workspace receive the routes'
  existing `403 {error:'Workspace access denied'}` before an admin client reads
  or mutates share state. Anonymous callers retain 401.
- A workspace member with `manage_projects` may administer a board in the same
  route workspace even when board access is resolved through the existing
  member path. Foreign/missing boards retain the current 404 behavior.
- Cookie auth and maintained Tasks app-session auth must use the same actor and
  permission contract. Add the exact wrapper option
  `{allowAppSessionAuth:{targetApp:[CLI_APP_TARGET_APP,'tasks']}}` to every
  exported method in both route files; Calendar app sessions are intentionally
  not accepted for share administration. Do not fall back to Supabase
  `auth.uid()` for app sessions.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`; read the Tasks app-session and board-access references.
Recheck the active Tasks production note: it owns dashboard and named API paths,
not these exact routes, but coordinate before changing the shared helper. Plan
076 explicitly excluded board-sharing semantics and is not a duplicate.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Shares route | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/shares/route.test.ts'` | collection POST/PATCH/DELETE member-manager matrix and pre-mutation denials pass |
| Public link | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/public-link/route.test.ts'` | GET/create/disable authorization matrix passes |
| Shared helper | `bun --cwd packages/tasks-api vitest run src/server/board-share-administration.test.ts` | cookie/app-session-safe membership and permission cases pass |
| Tasks packages | `bun run --cwd packages/tasks-api type-check && bun run --cwd apps/tasks type-check` | both exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** the shares collection route (including its POST/PATCH/DELETE
methods) and public-link route; their focused tests; one injectable
board-share-administration helper under `tasks-api` with a stable export.
**Out of scope:** board content editing, list/task access, share
permission values, invitations, viewable-members, UI redesign, database policy
or schema changes, and public-link response shapes.

## Steps

1. Freeze current route status/bodies for anonymous, missing/foreign board,
   member manager, ordinary member, direct view guest, and direct edit guest.
   Add both cookie and Tasks app-session cases and assert denial precedes admin
   share lookup/mutation.
2. Add `requireBoardShareAdministration({actorUserId,boardId,wsId,sbAdmin})`
   (or an equivalently closed result) that proves the board belongs to the route
   workspace, resolves a real workspace membership, and checks
   `manage_projects` with the canonical permission helper. Do not reuse generic
   `requiredPermission:'edit'` as administration authority.
3. Add the exact CLI/Tasks app-session option to every exported method, then
   apply the helper consistently before reading request bodies or opening the
   privileged mutation path. Retain existing validation and response envelopes
   after authorization.
4. Add helper/route regression coverage proving generic guest edit remains
   valid for board content while it no longer satisfies administration. Do not
   change the already-hidden guest UI controls.
5. Run focused tests, both typechecks, Tasks build, repository, whitespace, and
   exact-scope gates.

## Done criteria

- [ ] No direct guest or ordinary member can enumerate or mutate board shares
      or public links.
- [ ] A same-workspace member with `manage_projects` retains every supported
      administration operation through cookie and app-session auth.
- [ ] Board view/edit permissions outside administration are unchanged.
- [ ] Denials happen before privileged reads/writes and preserve status bodies.
- [ ] Focused tests, typechecks/build, `bun check`, and whitespace pass.

## STOP conditions

Stop if product policy intentionally grants share delegation to edit guests, an
active exact-path owner appears, app-session actor identity cannot reach the
permission helper, response behavior must change beyond authorization, or any
mandatory gate fails twice.
