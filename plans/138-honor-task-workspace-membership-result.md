# Plan 138: Honor Task Workspace Membership Results

> **Executor instructions:** Fix the structured-result truthiness bug in Task
> project workspace resolution, bound its input, and prove unauthorized board
> IDs never disclose a workspace ID.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/tasks/src/app/api/v1/task-projects/resolve-workspace/route.ts' 'apps/tasks/src/app/api/v1/task-projects/resolve-workspace/route.test.ts' packages/utils/src/workspace-helper.ts tmp/agent-coordination`
> The helper and coordination notes are read-only evidence. Stop on route,
> response, helper-contract, or ownership drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Tasks production build failed twice in the current
  environment (Google Fonts network restriction, then Turbopack CSS worker
  process/port `EPERM`); the reviewed two-file implementation, 12 passing
  focused tests, typecheck, and whitespace remains in
  `.worktrees/fix-task-workspace-membership-result`
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** security / bug
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

`verifyWorkspaceMembershipType` always returns an object, but the route coerces
that object rather than reading its `ok` field. Any authenticated actor who
knows a foreign board ID can therefore resolve the board's workspace ID despite
the route's intended non-enumeration boundary.

## Current state

- `resolve-workspace/route.ts:49-65` special-cases lookup failure and then
  returns `!!membership`; `{ok:false,error:'membership_missing'}` is truthy.
- `workspace-helper.ts:894-940` defines the discriminated result: only `ok`
  carries the authorization decision.
- The admin board lookup at route lines 69-86 can discover a foreign `ws_id`;
  the final response returns it after the broken check.
- `projectIds` has no maximum or deduplication. The route batches at 1,000 but
  accepts arbitrarily many IDs.
- No colocated route test exists.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. The active Tasks
production note owns the neighboring workspace-scoped project collection route,
not this exact top-level resolver; recheck exact-path ownership immediately
before editing. This is a Tasks satellite route; no Web migration artifacts
apply.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/tasks vitest run 'src/app/api/v1/task-projects/resolve-workspace/route.test.ts'` | all auth, validation, containment, and success cases pass |
| Tasks typecheck | `bun run --cwd apps/tasks type-check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the resolve-workspace route; new colocated test; README status.

**Out of scope:** membership helper semantics, board/project RLS, response shape,
project CRUD, UI, migrations/types, messages, Web/Rust/TanStack artifacts.

**Read-only drift evidence:** `workspace-helper.ts` and active coordination notes.

## Git workflow

Use `fix/task-workspace-membership-result`, run `bun setup`, and
commit `fix(tasks): honor workspace membership results`. Claim/release the
commit window; do not push unless instructed.

## Steps

### Step 1: Characterize the non-enumeration boundary

Create a route suite modeled on the nearest Tasks API mutation tests. Cover
unauthenticated, malformed JSON, missing identifiers, more than 1,000 project
IDs, duplicate IDs, foreign board with `membership_missing`, membership type
mismatch, lookup failure, authorized board, authorized projects, no candidates,
and conflicting workspaces. Denials must never return the candidate `ws_id`.

**Verify:** the focused suite fails on the two false-positive membership cases
and the missing input bound, while existing success/status behavior is frozen.

### Step 2: Use the discriminant and bound the request

Change the access helper to return `membership.ok`; retain the explicit
`membership_lookup_failed` 500 branch and the 404 non-enumerating denial for
other false results. Make the schema strict, cap `projectIds` at 1,000, and
deduplicate before database batching. Preserve board/project conflict behavior
and the `{workspaceId}` success shape.

**Verify:** the focused suite passes and asserts the foreign workspace ID never
appears in a denial body.

### Step 3: Run all gates

Run focused tests, Tasks typecheck/build, `bun check`, and whitespace. Confirm
only the route/test plus README changed.

## Done criteria

- [ ] Only `membership.ok === true` authorizes the final workspace response.
- [ ] Missing/mismatched membership returns the stable non-enumerating 404.
- [ ] Lookup failures remain 500 and do not disclose a candidate workspace.
- [ ] Project IDs are strict, deduplicated, and capped at 1,000.
- [ ] Focused, typecheck, build, repository, and whitespace gates pass.

## STOP conditions

Stop if a current coordination note claims the exact route/test, the membership
helper no longer returns the cited discriminant, clients require more than
1,000 IDs in one request, the response contract has drifted, or a gate fails
twice.

## Maintenance notes

Never boolean-coerce structured authorization results. Future callers should
branch on `ok` and treat lookup errors separately from ordinary denial.
