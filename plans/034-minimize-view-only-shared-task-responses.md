# Plan 034: Minimize View-Only Shared-Task Responses

> **Executor instructions:** Shape shared-task responses by effective
> permission. Public-link holders and view invitees must receive only the task
> and already-attached display relationships, never workspace-wide editing
> catalogs or roster data. Run every gate and update this plan's row in
> `plans/README.md` when complete.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/tasks/src/app/api/v1/shared/tasks/'[shareCode]' apps/tasks/src/app/'[locale]'/shared/task/'[shareCode]' packages/tasks-ui`
> Stop on material share-permission, response, or shared-dialog drift.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `b7fefde4dbce8b4155286e0328924453c521d663`
  on branch `fix/shared-task-response-scope`; focused route/UI tests, Tasks
  typecheck, `bun check`, Tasks production build, whitespace, and hooks passed
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / Least privilege / Data minimization
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

An authenticated public-link holder or view-only invitee is authorized for one
task, but the admin-backed response includes every list on its board plus every
workspace label, project, and member. A task-scoped share therefore becomes a
workspace-directory and internal-project disclosure.

## Current state

- `apps/tasks/src/app/api/v1/shared/tasks/[shareCode]/route.ts:99-185` grants
  view access without workspace membership for public links and view invitees.
- Lines 204-248 correctly load relationships attached to the shared task.
- Lines 250-287 additionally load all board lists and workspace labels,
  projects, and members regardless of effective permission.
- Lines 334-359 return those collections to every eligible caller, and the
  shared page forwards them all to `SharedTaskContent` even for view-only mode.

## Required skills and preflight

Load `$tuturuuu-platform`, `$vercel-react-best-practices`, and
`$tuturuuu-agent-coordination`. Characterize the read-only dialog before
changing its props; do not weaken edit permission checks to preserve rendering.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route test | `bun --cwd apps/tasks vitest run 'src/app/api/v1/shared/tasks/[shareCode]/route.test.ts'` | permission-shaped responses pass |
| Shared-content test | `bun --cwd apps/tasks vitest run 'src/app/[locale]/shared/task/[shareCode]/content.test.tsx'` | view/edit UI contracts pass |
| Tasks typecheck | `bun run --cwd apps/tasks type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Shared-task GET route, response types, and new colocated `route.test.ts`
- Shared-task page/content props, new `content.test.tsx`, and read-only
  presentation as required
- A small permission-shaped response helper if it improves testability

Do not redesign sharing UX, change link eligibility, alter PATCH behavior, or
broaden the task-share permission model.

## Git workflow

- Branch: `fix/shared-task-response-scope` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(tasks): minimize shared task responses`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Characterize data required by each permission

Add route/UI fixtures for workspace editor, explicit edit invitee, view
invitee, and public viewer. Identify fields actually rendered in read-only mode.
Define discriminated response types so view-only code cannot accidentally
depend on edit catalogs.

### Step 2: Return a minimal view response

For effective `view`, fetch only the shared task, its board/list display
identity, and assignees/labels/projects already attached to that task. Limit
person fields to the display values required by the page. Do not query or
return `availableLists`, `workspaceLabels`, `workspaceProjects`, or
`workspaceMembers`.

### Step 3: Bound the edit response

Fetch editing catalogs only after effective edit permission is established.
Confirm whether every workspace member is actually assignable/board-visible;
if not, scope choices through the canonical board/task permission helper. Keep
admin queries downstream of authorization.

### Step 4: Align the client and prove non-disclosure

Render a dedicated read-only task view or make edit-only props impossible in
the view branch. Add negative assertions that unrelated fixture lists, labels,
projects, member ids, names, and avatars are absent from serialized view
responses while editors retain required controls.

## Test plan

- Add route fixtures for workspace editor, edit invitee, view invitee, public
  viewer, invite-required denial, and anonymous behavior.
- Add shared-content tests proving the view branch cannot accept or serialize
  edit catalogs while the edit branch remains functional.
- Use named unrelated rows and assert none appear in view JSON.

## Done criteria

- [ ] View-only responses contain no workspace-wide editing collections.
- [ ] Only relationships attached to the shared task are visible to viewers.
- [ ] Edit catalogs are loaded only for effective edit permission and follow
      canonical assignability/visibility rules.
- [ ] Response types keep view and edit contracts distinct.
- [ ] Route/UI tests, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if the read-only component cannot render without edit catalogs and the
required redesign crosses shared Tasks ownership, or if board-level visibility
semantics are undefined. Do not expose the full roster as a compatibility
fallback.

## Maintenance notes

Treat public/view links as capability-scoped access, not temporary workspace
membership. New response fields must be reviewed against that boundary.
