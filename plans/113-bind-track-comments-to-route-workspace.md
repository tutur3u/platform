# Plan 113: Bind Track Comment Mutations to the Route Workspace

> **Executor instructions:** Make PATCH and DELETE prove that the parent time
> tracking request belongs to the normalized route workspace before any
> service-role comment read or mutation. Preserve comment ownership and the
> existing fifteen-minute edit/delete window.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/requests/[id]/comments' apps/track/src/lib tmp/agent-coordination`
> Stop on comment authorization, workspace normalization, or exact-path
> ownership drift.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `b086d9eec7c641e4784cb11614a380df9361591c`
  on branch `fix/track-comment-workspace-boundary`; 14 focused tests, Track
  typecheck/build, `bun check`, whitespace, and hooks passed
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** security
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The item route checks membership in the caller-selected `wsId`, then loads the
comment through an admin client using only request/comment ids. A comment author
removed from workspace B can therefore route known B ids through workspace A,
where they remain a member, and edit or delete during the allowed time window.

## Current state

- `comments/[commentId]/route.ts:25-65` authenticates, checks route-workspace
  membership, then reads the comment without joining its parent workspace.
- Its DELETE implementation repeats the same pattern at lines 149-183.
- The sibling `comments/route.ts:62-85` establishes the intended boundary by
  loading `time_tracking_requests` with both request id and `workspace_id`.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. No active note
owns this exact Track route; recheck immediately before editing. This is a
Track-satellite API, not an `apps/web` route, so do not edit G22 migration
artifacts unless a current repository rule explicitly requires it.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/requests/[id]/comments/[commentId]/route.test.ts'` | PATCH/DELETE authorization cases pass |
| Track typecheck | `bun run --cwd apps/track type-check` | exit 0 |
| Track build | `bun run --cwd apps/track build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- the item comment route and a colocated new route test
- a small Track-local request/workspace containment helper only if both methods
  cannot share the sibling route's established query cleanly
- `plans/README.md` only for status

Do not change comment visibility, authorship, time windows, response shapes, or
time-request approval permissions.

## Git workflow

Use branch `fix/track-comment-workspace-boundary` in an isolated worktree and
run `bun setup`. Commit `fix(track): bind comments to route workspace`. Claim
the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize the two-workspace failure

Add route-level tests for self-owned comments in the route workspace, a comment
in another workspace where the actor is still a member of the route workspace,
a revoked parent-workspace member, anonymous auth, unrelated app-session target,
expired edit/delete windows, and non-owner mutations. Assert denied cases reach
no update/delete call.

### Step 2: Bind the parent before the comment

Normalize the route workspace using the same Track convention as the sibling
collection route. Before the admin comment lookup, require a parent request row
matching both `requestId` and normalized `workspace_id`; return 404 without
revealing cross-workspace existence when it does not match. Keep membership
lookup failures distinct from denial.

### Step 3: Preserve mutation predicates and contracts

Retain comment id plus request id in the authoritative lookup and include both
predicates on the final update/delete where the query builder permits it. Keep
the current success, ownership, validation, and time-window responses.

### Step 4: Run application gates

Run focused tests, typecheck, the real Track build, `bun check`, and whitespace.

## Done criteria

- [ ] PATCH and DELETE prove the parent request belongs to the normalized route workspace.
- [ ] Cross-workspace and revoked-member cases perform no comment mutation.
- [ ] Ownership and fifteen-minute behavior are unchanged and tested.
- [ ] Focused tests, typecheck, Track build, and repository gates pass.

## STOP conditions

Stop if exact-path ownership appears, request rows use a different canonical
workspace field, a legitimate caller depends on cross-workspace mutation, or an
in-scope gate fails twice.

## Maintenance notes

Treat path workspace ids as untrusted selectors whenever an admin client is
used; every child-object mutation must bind the parent tenant explicitly.
