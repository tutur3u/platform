# Plan 067: Require Score-Update Permission for Group Indicators

> **Executor instructions:** Enforce the established granular score-update
> permission before the shared group-indicator PATCH route reaches its
> service-role RPC, then cover both denial and authorized mutation behavior.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'packages/users-core/src/routes/user-groups/[groupId]/indicators/route.ts' 'packages/users-core/src/routes/user-groups/[groupId]/indicators/route.test.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route.test.ts' 'apps/contacts/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route.test.ts' 'apps/backend/src/workspaces_wsid_user_groups_groupid_indicators.rs'`
> Stop on permission, handler, test-fixture, or Rust method-ownership drift.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `7b0164b016608cb88f593c084864c0311200ca4f`
  on branch `fix/group-indicator-score-permission`; shared/Web/Contacts tests,
  backend gate, `bun check`, both app builds, whitespace, and hooks passed
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** Security / Authorization
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The shared PATCH handler crosses from ordinary workspace access into a
service-role, security-definer score mutation without checking the permission
created for that action. Any workspace member can therefore overwrite or clear
another member's group indicator values and leave an audit record of an action
that should have been rejected.

## Current state

- `packages/users-core/src/routes/user-groups/[groupId]/indicators/route.ts:267-307`
  resolves a permission context but never checks it before invoking
  `admin_upsert_user_indicator_values_with_audit_actor` through the admin client.
- The same file's GET requires `view_user_groups_scores`, and POST requires
  `create_user_groups_scores`. The sibling indicator item route requires
  `update_user_groups_scores`, establishing the intended PATCH capability.
- `20260521103730_user_group_activity_actor_context.sql:164-232` defines the
  security-definer RPC. It validates workspace/group/user/metric containment,
  but deliberately leaves actor authorization to the route.
- The live Web test covers POST only. Contacts re-exports the same shared core
  handler, so one core authorization fix protects both callers.
- Rust owns GET for this path only. PATCH must continue falling through to the
  live Next handler; no Rust mutation port is part of this fix.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Confirm the Rust
handler still returns `None` for PATCH and no active note owns the shared route
or exact test. Do not broaden the database function or role catalog.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused shared-route test | `bun run --cwd packages/users-core test -- 'src/routes/user-groups/[groupId]/indicators/route.test.ts'` | unauthorized and authorized PATCH cases pass |
| Live Web regression | `bun run --cwd apps/web test -- 'src/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route.test.ts'` | existing POST and new PATCH boundary pass |
| Contacts regression | `bun run --cwd apps/contacts test -- 'src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route.test.ts'` | satellite re-export enforces the shared PATCH guard |
| Users-core typecheck | `bun run --cwd packages/users-core type-check` | exit 0 |
| Backend method guard | `bun check:backend` | GET remains owned and PATCH remains fallthrough |
| Repository gate | `bun check` | exit 0 |
| Production builds | `bun run --cwd apps/contacts build && bun run --cwd apps/web build` | both affected Next apps build successfully |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/users-core/src/routes/user-groups/[groupId]/indicators/route.ts`
- New focused
  `packages/users-core/src/routes/user-groups/[groupId]/indicators/route.test.ts`
- Existing live-route regression in
  `apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route.test.ts`
- New Contacts re-export regression in
  `apps/contacts/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route.test.ts`

Do not change permission definitions, RPC SQL, response bodies, GET/POST
semantics, Rust GET behavior, route locations, or migration metadata.

## Git workflow

- Branch: `fix/group-indicator-score-permission` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(users): authorize group indicator updates`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Enforce the existing mutation capability

After resolving `getUserGroupRoutePermissions` and before parsing the request
body or creating an admin client, reject PATCH when
`withoutPermission('update_user_groups_scores')` is true. Return 403 using the
sibling score-update wording/pattern. A denied request must not parse the body,
resolve the audit actor, create the admin client, or invoke the RPC.

### Step 2: Lock the shared handler boundary

Create a focused shared-route test with explicit permission and admin-RPC
doubles. Cover missing permission context (404), permission denied (403 with no
privileged work), invalid non-array payload (400 for an authorized actor),
successful nullable and numeric values, actor attribution, and RPC failure.
Assert the exact capability name so a generic membership check cannot replace
it later.

### Step 3: Preserve live Web and Rust ownership

Extend the existing Web test and add a thin Contacts route test with one denial
and one authorized PATCH case to prove both production re-exports invoke the
shared guard. Verify the Rust runtime still claims GET only and falls through
on PATCH; do not port or change the Rust handler for this TypeScript
authorization repair.

## Test plan

The shared suite proves ordering and privileged-call suppression. The live Web
suite proves the wrapper/re-export path receives that behavior. The backend
gate protects the existing method-level migration contract.

## Done criteria

- [ ] PATCH requires `update_user_groups_scores` before body parsing or admin work.
- [ ] Denied callers cannot invoke the security-definer RPC.
- [ ] Authorized nullable/numeric updates retain the existing response and actor attribution.
- [ ] Shared, Web, and Contacts tests, both app builds, users-core typecheck,
      backend gate, `bun check`, and whitespace pass.
- [ ] No database, route-location, migration-metadata, or Rust source changes are made.

## STOP conditions

Stop if the granular permission was renamed/removed, PATCH becomes Rust-owned,
an active owner claims the exact shared path, callers intentionally require a
different capability, or satisfying the fix requires a database-policy change.

## Maintenance notes

Keep authorization at the route boundary even though the RPC validates tenant
containment. Audit attribution records who attempted an allowed mutation; it is
not a substitute for permission enforcement.
