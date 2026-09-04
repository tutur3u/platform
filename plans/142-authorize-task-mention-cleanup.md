# Plan 142: Authorize and Preserve Task Mention Cleanup

> **Executor instructions:** Restrict mention cleanup to a task that was
> actually deleted in the route workspace and persist every affected task
> through the canonical description boundary. Run every gate.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/tasks/[taskId]/mentions/cleanup/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/tasks/[taskId]/mentions/cleanup/route.test.ts' packages/tasks-ui/src/text-editor/task-mention-chip.tsx packages/internal-api/src/tasks.ts packages/tasks-api/src/server/tasks/taskId/description/route.ts tmp/agent-coordination`
> Only the cleanup route/test are implementation scope; the other paths are
> read-only caller/persistence evidence.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** Plan 071's atomic description-persistence implementation is
  retained uncommitted after its mandatory Tasks build failed; do not duplicate
  or copy that unapproved work across worktrees
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / bug
- **Depends on:** Plan 071 must be DONE
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Any Tasks workspace member can currently submit any task UUID and force an
admin-backed rewrite of every live task description containing that mention.
The route never proves the target belongs to the workspace or is deleted, and
raw description-only updates can desynchronize the Yjs representation while
individual update failures are ignored.

## Current state

- `mentions/cleanup/route.ts:44-73` verifies only membership in route `wsId`.
- Lines 76-104 load every live task in that workspace and find caller-selected
  mention IDs without loading the target task.
- Lines 120-132 issue parallel admin `description` updates, discard each result,
  and always return success.
- `packages/tasks-ui/src/text-editor/task-mention-chip.tsx:515-542` invokes this
  only after `baseHandleDelete()` succeeds, establishing deleted-target intent.
- Plan 071 removes the split plain/Yjs write in the canonical description route;
  cleanup must not reintroduce representation drift.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/tasks/[taskId]/mentions/cleanup/route.test.ts'` | all cases pass |
| Tasks typecheck | `bun run --cwd apps/tasks type-check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** cleanup route; new colocated test; an optional route-local helper;
README status.

**Out of scope:** editor/caller UI, internal-api signature, task deletion UX,
Plan 071 files, schemas/migrations, global background jobs, translations,
Web/Rust/TanStack artifacts.

## Git workflow

Use `fix/task-mention-cleanup-boundary`, run `bun setup`, and commit
`fix(tasks): authorize mention cleanup`. Claim/release the commit window.

## Steps

### Step 1: Characterize target and write failures

Add tests for unauthenticated, lookup error, nonmember, target missing, target
in another workspace, target still live, authorized deleted target, malformed
descriptions, no matches, and one affected-task persistence failure. Include a
Tasks app-session actor so service-role bypass cannot hide missing predicates.

**Verify:** the focused suite fails on foreign/live targets and swallowed write
failure while freezing the current `{success:true}` success envelope.

### Step 2: Prove the cleanup target

Normalize `wsId`; after actor and membership checks, load `taskId` through its
list/board relation with board `ws_id = normalizedWsId` and require non-null
`deleted_at`. Return non-enumerating 404 for missing, foreign, or live targets.
Do this before scanning other descriptions.

**Verify:** focused authorization/target tests pass and perform no workspace
scan or mutation on denial.

### Step 3: Preserve both description representations

For each changed task, derive the cleaned TipTap JSON and matching Yjs state
using the same validated conversion seam as the canonical description route,
then send both fields in one actor-aware task update operation. Before any
mutation, issue a workspace-contained `head: true, count: 'exact'` task query;
refuse with 409 when the count exceeds the synchronous 1,000-task contract, then
load the bounded page of at most 1,000. Do not use a 1,001-row sentinel because
the local PostgREST `max_rows` is 1,000. Likewise refuse before writing if more
than 500 descriptions match. Use bounded concurrency (maximum
10). Inspect every result; return a sanitized 500 if any write fails rather than
reporting false success. A retry is idempotent because already-cleaned
descriptions no longer match. Do not add a second raw admin update or silently
keep a plain/Yjs split.

**Verify:** focused tests prove exact counts 1,000/1,001 and matching counts
500/501 occur before writes, the data query never requests more than 1,000,
successful writes contain matching plain/Yjs
representations, at most 10 run concurrently, one failure prevents a success
response, and retry skips already-cleaned tasks.

### Step 4: Run all gates

Run focused tests, Tasks typecheck/build, `bun check`, and whitespace.

## Done criteria

- [ ] Cleanup requires a deleted target task contained in the route workspace.
- [ ] Denials never scan or mutate other tasks.
- [ ] Every changed task persists plain and Yjs descriptions together through an actor-aware boundary.
- [ ] Persistence is bounded and no write error is ignored.
- [ ] All commands pass and only scoped files plus README changed.

## STOP conditions

Stop if Plan 071's atomic payload has not been approved for reuse, cleanup is
called before deletion anywhere, an active note claims the exact route/test,
the canonical conversion requires editing out-of-scope files, or a gate fails
twice.

## Maintenance notes

This remains synchronous only for the bounded current workflow. If production
measurement shows large fan-out, replace it with an idempotent background job;
do not merely raise concurrency.
