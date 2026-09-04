# Plan 132: Require Member-Management Permission for Batch Invitations

> **Executor instructions:** Align the v1 batch-invite authorization boundary
> with the maintained single-invite route before any body parsing, seat lookup,
> admin client creation, invitation write, onboarding update, or notification.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/web/src/app/api/v1/workspaces/[wsId]/members/batch-invite/route.ts' apps/web/src/__tests__/workspace-members-batch-invite-route.test.ts 'apps/web/src/app/api/workspaces/[wsId]/members/invite/route.ts' packages/internal-api/src/workspaces.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`
> The single-invite route and internal-api caller are read-only evidence. Stop on
> authorization, caller, response, route-tracking, or ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** security
- **Depends on:** member-invite satellite-auth and G22 migration-artifact ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The batch route accepts any authenticated workspace member, then uses a service
role to create invitations. An ordinary member or guest can therefore invite
arbitrary addresses, consume available paid seats, and trigger notifications
without `manage_workspace_members`. The sibling single-invite route already
defines the intended MEMBER-plus-permission contract.

## Current state

- `batch-invite/route.ts:57-84` calls `resolveSessionAuthContext` and
  `verifyWorkspaceMembershipType`, but accepts every successful membership.
- `batch-invite/route.ts:101-135` creates an admin client and inserts
  `workspace_email_invites`, so RLS cannot supply the missing permission check.
- `members/invite/route.ts:91-104` uses `resolveWorkspaceRouteAccess`, rejects
  guests and `withoutPermission('manage_workspace_members')`, and uses the
  normalized `permissions.wsId`.
- The batch test covers membership success/auth failure but not guest,
  capability denial, authorization lookup failure, or no-side-effect ordering.
- Rust has no handler for this exact v1 route. Its manifest entry exists, but
  `route-overrides.json` has no matching first-class Next backlog record.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Do not start until
`20260725-180000-member-invite-satellite-auth.md` transfers the route/test and
the G22 owner transfers both migration artifacts. Keep the route first-class;
do not move it into `legacy-api-routes`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/web vitest run src/__tests__/workspace-members-batch-invite-route.test.ts` | all authorization/order/success cases pass |
| Route tracking | `bun migration:tanstack:manifest && bun migration:tanstack:manifest --check` | override and generated manifest are current |
| Web route checks | `bun web:api-routes:check` | exit 0; route stays first-class |
| Web typecheck | `bun run --cwd apps/web type-check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the batch route; its existing focused test; the exact batch route
override and regenerated manifest; README status.

**Out of scope:** single-invite behavior, seat algorithms, invitation
atomicity/batching, notification delivery, onboarding schema, Rust ports,
internal-api caller changes, messages, migrations, and generated DB types.

**Read-only drift evidence:** single-invite route, internal-api helper, and
active coordination notes.

## Git workflow

After transfer use `fix/authorize-workspace-batch-invites`, run `bun setup`, and
commit `fix(workspaces): authorize batch invitations`. Claim/release the commit
window; do not push unless instructed.

## Steps

### Step 1: Characterize the permission boundary

Extend the focused test with: GUEST, MEMBER without permission, permission
lookup/access failure, authorized MEMBER, and onboarding-owner regression.
Every denial must occur before `req.json`, seat lookup, admin creation, invite
insert, progress update, and notification trigger.

**Verify:** the focused suite fails only because the live route is
membership-only; test doubles expose counters for every forbidden dependency.

### Step 2: Reuse the maintained access resolver

Replace the membership-only sequence with `resolveWorkspaceRouteAccess(req,
requestedWsId)`. Require `permissions.membershipType === 'MEMBER'` and
`permissions.withoutPermission('manage_workspace_members') === false`, return
the same stable 403 envelope as single invite, and use `permissions.wsId` for
seat checks, rows, and logs. Preserve app-session support and successful result
shape.

**Verify:** focused tests pass and prove unauthorized actors invoke no body,
seat, admin, persistence, onboarding, or notification dependency.

### Step 3: Register the changed live route

Add the exact id
`api:/api/v1/workspaces/:wsId/members/batch-invite:apps/web/src/app/api/v1/workspaces/[wsId]/members/batch-invite/route.ts`
as `legacy-next`/`rust-backend` backlog, noting the app-session-aware permission
boundary. Regenerate the manifest.

**Verify:** both migration commands and `bun web:api-routes:check` pass; no
unrelated override changes appear.

### Step 4: Run all gates

Run focused tests, Web typecheck/build, `bun check`, and whitespace. Confirm
status lists only scoped files plus the executor-owned README row.

## Done criteria

- [ ] Only MEMBER actors with `manage_workspace_members` reach seat/admin work.
- [ ] Denials and resolver failures have zero downstream side effects.
- [ ] App-session and authorized onboarding-owner behavior remain supported.
- [ ] Route override/manifest, focused tests, typecheck, build, and repo gates pass.

## STOP conditions

Stop if ownership is not transferred, the single-invite permission contract has
changed, onboarding truly requires a non-member actor, Rust already owns the
path, route artifacts drift outside this id, or a gate fails twice.

## Maintenance notes

Future invitation entry points must share one authorization helper. Do not use
service-role writes as evidence that the actor is authorized.
