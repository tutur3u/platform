# Plan 082: Authorize Board Template Publication

> **Executor instructions:** Require source-board edit access for every board
> export and `manage_projects` before workspace/public publication. Replace the
> caller-cast body with a bounded strict schema.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/templates/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/templates/route.test.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-templates/_lib.ts' packages/tasks-api/src/server/board-access.ts`
> Stop on board-access, visibility, or template-contract drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Security / authorization and data disclosure
- **Depends on:** Tasks production/release ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Any workspace member can currently export a board's lists, task names,
descriptions, dates, and workspace labels into a caller-selected public
template. That turns workspace-only planning data into platform-wide marketplace
content without board edit or template-management authority.

## Current state

- The route verifies only workspace membership, then reads the source board and
  labels with the admin client.
- `visibility` accepts `private`, `workspace`, or `public` from an unchecked body.
- The adjacent task-template helper already treats `manage_projects` as the
  boundary for workspace-scoped template publication.
- Active Tasks notes claim broad `apps/tasks/**` work, so execution is blocked.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Inspect active
Tasks notes and the canonical board-access helper. Preserve cookie and actual
Tasks app-session audiences; do not invent a new actor path.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/templates/route.test.ts'` | access, visibility, validation, and export cases pass |
| Tasks types | `bun run --cwd apps/tasks type-check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Repository gate | `bun check` | exit 0, or only a documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/templates/route.ts`
- its colocated `route.test.ts` (create)
- `apps/tasks/src/app/api/v1/workspaces/[wsId]/task-templates/_lib.ts` only to
  reuse a named publication guard without changing task-template behavior
- `packages/tasks-api/src/server/board-access.ts` only if an injectable existing
  edit decision cannot be reused as-is
- `plans/README.md` only for status

Do not change marketplace response shapes, template instantiation, board
sharing semantics, or stored template content beyond necessary validation.

## Git workflow

Use branch `fix/authorize-board-template-publication` in an isolated worktree
and run `bun setup`. Commit `fix(tasks): authorize board template publication`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Add the access and visibility matrix

Cover owner/manager, explicit edit share, read-only share, ordinary member,
nonmember, missing/cross-workspace board, and cookie/app-session actors. For
each permitted board actor, separately cover private, workspace, and public
visibility.

### Step 2: Require canonical board edit access

Resolve the source board using the existing `requireBoardAccess` contract with
`requiredPermission: 'edit'` before any admin read. A workspace membership
check alone must never authorize copying board contents.

### Step 3: Gate broad publication

Allow a board editor to create a private template. Require `manage_projects`
for both workspace and public visibility, matching the maintained template
management boundary. Return 403 before reading labels or inserting content.

### Step 4: Strictly bound the request

Use a strict Zod schema with explicit maximum lengths for name, description,
and storage path; enums for visibility; booleans for include flags; malformed
JSON handling; and unknown-key rejection. Construct the insert payload
explicitly.

### Step 5: Verify the disclosure boundary

Prove denied callers cannot invoke admin board/label reads or template inserts.
Run focused tests, Tasks types/build, `bun check`, and whitespace validation.

## Done criteria

- [ ] Source-board edit access is required before content extraction.
- [ ] Workspace/public publication requires `manage_projects`.
- [ ] The request body is strict, bounded, and explicitly mapped.
- [ ] Denied callers cannot read or publish privileged board content.
- [ ] Focused tests, types, build, repository, and whitespace gates pass.

## STOP conditions

Stop if Tasks ownership remains active, canonical board access cannot express
the required policy, existing clients rely on undeclared fields, or a required
gate fails twice.

## Maintenance notes

Template visibility is a publication boundary. Authorization must cover both
the source object and the destination audience.
