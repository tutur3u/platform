# Plan 063: Cover Feedback Mutation Authorization

> **Executor instructions:** Add focused route-level tests that lock the current
> permission, actor-link, tenant-containment, validation, and error contracts for
> workspace feedback POST, PUT, and DELETE.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/feedbacks/route.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/feedbacks/shared.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/feedbacks/route.test.ts' packages/utils/src/__tests__/api-proxy-guard.test.ts`
> Stop if route authorization or ownership changed; this plan characterizes the
> current boundary and does not silently redefine it.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `81a835b4eceec1fe133ac98f961c3729d6d3e415`
  on branch `chore/feedback-mutation-authorization`; 21 focused tests, Web
  typecheck, `bun check`, whitespace, and hooks passed
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** Tests / Authorization regression coverage
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

One route combines the permission gate, platform-to-workspace actor link,
cross-workspace target containment, validation, and service-role mutations for
feedback creation, updates, and deletion. Current proxy tests prove only that
the URL is routed; a regression in any of these checks can alter another
workspace's feedback without a focused test failing.

## Current state

- `feedbacks/route.ts:97-174` requires `update_user_groups_scores`, resolves the
  authenticated platform actor, verifies its workspace-user link, validates the
  target user/group workspace, and inserts with the linked creator ID.
- Lines `192-257` validate PUT, scope the feedback through its target user's
  workspace, and then update via the admin client.
- Lines `260-313` repeat the containment check before admin deletion.
- `packages/utils/src/__tests__/api-proxy-guard.test.ts:934-937` covers proxy
  routing only. `users/[userId]/route.test.ts` is the exact sibling exemplar
  for distinct request-scoped/admin clients and explicit mutation assertions.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Inspect active
Contacts/user-surface notes. This is test-only: do not rework or move the legacy
route, regenerate wrappers/manifests, or change production behavior.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun run --cwd apps/web test -- 'src/legacy-api-routes/v1/workspaces/[wsId]/users/feedbacks/route.test.ts'` | full mutation matrix passes |
| Web typecheck | `bun run --cwd apps/web type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- New `apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/feedbacks/route.test.ts`
- The route/shared modules only as read-only fixtures; no production edits

Do not change response shapes, permissions, query behavior, proxy guards,
database policies, Contacts UI, migration metadata, or generated wrappers.

## Git workflow

- Branch: `chore/feedback-mutation-authorization` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `test(users): cover feedback mutation authorization`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Build the route-test fixture

Model module resets, request construction, permission doubles, and chainable
Supabase mocks on
`apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/[userId]/route.test.ts`.
Provide separate request-scoped and admin clients so assertions can distinguish
authentication, containment reads, and mutations.

### Step 2: Characterize POST

Cover missing workspace access, missing permission, a syntactically valid but
schema-invalid body, absent session actor, missing workspace-user link,
foreign/missing target user, foreign/missing group, success with linked
`creator_id`, rate-limit error mapping, and generic database failure. Assert no
mutation occurs on every denial. Do not assert a response for syntactically
invalid JSON: the current uncaught `request.json()` rejection is outside this
characterization plan.

### Step 3: Characterize PUT and DELETE

For each method cover missing permission/ID, malformed update content where
applicable, missing or foreign-workspace feedback, successful mutation, and
database failure. Assert the containment lookup includes the route workspace
before the admin mutation and denial paths never update/delete.

## Test plan

The single focused file covers all three mutations and verifies status/body plus
query/mutation arguments. Avoid broad snapshots and avoid mocks that return the
expected response without exercising the route's real branches. Run it alone,
then Web typecheck and the repository gate.

## Done criteria

- [ ] POST actor-link, permission, target-workspace, and insert attribution are tested.
- [ ] PUT/DELETE foreign-workspace and missing-object paths are tested.
- [ ] Denied paths prove no admin mutation occurs.
- [ ] Rate-limit and generic database errors retain their response contracts.
- [ ] Focused tests, typecheck, repository gate, and whitespace pass.
- [ ] Only the new test and advisor index status are changed by execution.

## STOP conditions

Stop if an active owner claims the feedback route/test, route behavior differs
from the current-state contract, faithful chain mocks require production-code
changes, or a test exposes a real authorization bug; report that bug for a
separate security plan instead of encoding vulnerable behavior as expected.

## Maintenance notes

When feedback mutations move out of legacy, move this characterization suite
with them and preserve it as the route-parity gate.
