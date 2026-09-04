# Plan 051: Bind Meet Plan Creation to Workspace Members

> **Executor instructions:** Preserve intentional anonymous workspace-less
> meetings while preventing anonymous or non-member creation inside a tenant.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/web/src/app/api/v1/meet/plans/route.ts packages/apis/src/meet/actions/plans.ts packages/apis/src/meet/actions apps/tanstack-web/migration`
> Stop if another lane changed plan creation or the anonymous product contract.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** Security / Tenant authorization
- **Depends on:** G22 route-artifact ownership release or explicit transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

POST accepts a caller-selected workspace UUID and the admin-backed action does
not require its resolved user. Anonymous callers can therefore inject meeting
plans into any known workspace, bypassing the table's intended membership RLS.

## Current state

- The route validates shape but forwards `ws_id` unchanged.
- `createPlan` resolves a user yet allows it to be null, then inserts with the
  admin client and a nullable creator.
- The action has no other production caller, so its contract can be made safe at
  the shared boundary without duplicating route-only checks.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Confirm from
product/UI behavior that anonymous plans without a workspace remain supported.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Web route tests | `bun run --cwd apps/web test -- src/app/api/v1/meet/plans/route.test.ts` | actor/workspace matrix passes |
| API action tests | `bun run --cwd packages/apis test -- src/meet/actions/plans.test.ts` | shared boundary passes |
| API typecheck | `bun --cwd packages/apis type-check` | exit 0 |
| Route tracking | `bun migration:tanstack:manifest && bun migration:tanstack:check` | refreshed note and manifest describe the authenticated contract |
| Repository gate | `bun check` | exit 0 |
| Real app compile | `bun run build:web` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/web/src/app/api/v1/meet/plans/route.ts`
- `apps/web/src/app/api/v1/meet/plans/route.test.ts`
- `packages/apis/src/meet/actions/plans.ts`
- `packages/apis/src/meet/actions/plans.test.ts`
- The existing Meet-plan entry in
  `apps/tanstack-web/migration/route-overrides.json` and generated manifest

Do not change public plan retrieval, guest joining, or meeting-plan schema.

## Git workflow

- Branch: `fix/meet-plan-workspace-membership` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(meet): authorize workspace plan creation`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Make the action contract explicit

Have `createPlan` distinguish workspace-less anonymous creation from
workspace-scoped creation. If no actor exists, reject any non-null workspace
instead of silently persisting it.

### Step 2: Verify membership before admin writes

For a workspace-scoped request, require the authenticated actor, verify current
membership using an injectable access helper, and derive `creator_id` from that
actor. Return stable 401/403 errors rather than leaking membership details.

### Step 3: Keep the route thin

Parse invalid JSON and schema failures deterministically, pass only validated
fields, and map typed action failures to established status codes. Do not trust
the body as an authorization source.

### Step 4: Refresh migration metadata

Update the existing override note, without changing its `legacy-next` owner,
to state that workspace creation requires authenticated membership. Regenerate
and check the manifest; do not add a Rust handler or claim traffic cutover.

## Test plan

Cover anonymous workspace-less success, anonymous workspace rejection,
authenticated non-member rejection, member success with server-derived creator,
unknown workspace, and admin insert failure. Assert no admin insert occurs on
every rejected path.

## Done criteria

- [ ] Anonymous callers cannot assign plans to a workspace.
- [ ] Workspace plans require verified membership and an authenticated creator.
- [ ] The shared action, not only the route, enforces the invariant.
- [ ] Focused tests, typecheck, repository gate, and Web build pass.

## STOP conditions

Stop while G22 owns aggregate route artifacts or if anonymous workspace-bound plans are an intentional documented feature;
that requires an explicit invitation/capability design rather than a membership
assumption.

## Maintenance notes

Admin clients bypass RLS; every tenant identifier supplied to an admin-backed
action must be derived or explicitly authorized first.
