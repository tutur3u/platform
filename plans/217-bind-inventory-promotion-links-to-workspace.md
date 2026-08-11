# Plan 217: Bind Inventory Promotion Links to the Route Workspace

> **Executor instructions:** Contain the Inventory compatibility route before
> every service-role read/write by proving both the workspace user and promotion
> belong to the normalized route workspace. Match the maintained Contacts-owned
> handler; do not broaden this into a CRM ownership reversal.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- 'apps/inventory/src/app/api/v1/workspaces/[wsId]/users/[userId]/linked-promotions' 'packages/users-core/src/routes/users/[userId]/linked-promotions' tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Finance/Inventory owner must transfer or
  canonically close the exact application path
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** security / tenant isolation
- **Depends on:** none
- **Planned at:** commit `52f4aa1b12`, 2026-08-11

## Why this matters

The Inventory route authorizes `update_users` in workspace A, then uses the
service-role client with a caller-selected `userId`. POST validates only the
promotion; DELETE validates neither parent and discards the normalized
workspace. A manager can therefore link A's promotion to B's workspace user or
unlink a known cross-tenant pair. The Contacts/users-core handler already
implements the intended two-parent containment contract.

## Current state and exact contract

- Inventory `POST` checks `workspace_promotions(id, ws_id)` but never
  `workspace_users(id, ws_id)` before insert.
- Inventory `DELETE` filters only `user_id` and `promo_id` after permission
  checking; it does not use `normalizedWsId`.
- Inventory `GET` filters returned promotions to the route workspace, but first
  queries arbitrary user's links through the admin client. Validate the user
  before that read so foreign identities are non-enumerable.
- Mirror the users-core helper pattern: `workspace_users` is in `public`,
  `workspace_promotions`/`user_linked_promotions` are in `private`; query errors
  are 500, absent parents are stable 404, and no mutation occurs after a failed
  parent check.
- Keep successful response bodies unchanged. Preserve authorization and app-
  session-aware Finance route context.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-commit`, and `$using-git-worktrees`; read root and Inventory AGENTS.
Do not start while `tmp/agent-coordination/20260709-123138-claude-finance-inventory-migration.md`
is `working` and claims `apps/inventory/src/**`; require exact transfer or a
canonical terminal/archive disposition. Use an exact-base isolated worktree
and run `bun setup` immediately after ownership clears.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller/owner inventory | `rg -n 'linked-promotions' apps/inventory apps/contacts packages/users-core apps/backend/src --glob '!**/node_modules/**'` | all live/compatibility callers classified; no hidden Inventory client contract invented |
| Focused test | `bun --cwd apps/inventory vitest run 'src/app/api/v1/workspaces/[wsId]/users/[userId]/linked-promotions/route.test.ts'` | all authorization/tenant/error cases pass |
| Typecheck/build | `bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** the Inventory linked-promotions route and a new colocated route
test. **Read-only exemplar:** the users-core Contacts route and tests. **Out of
scope:** changing Contacts/users-core, Rust/Web ownership, Finance discount
semantics, referral trigger rules, schema/migrations/generated types, UI,
messages, or route manifests.

## Steps

1. Add a route test with injectable admin/auth mocks. Red cases: foreign user
   GET/POST/DELETE, foreign promotion POST/DELETE, parent lookup failure, and
   denial before any link read/write. Green cases: authorized GET, idempotent
   authorized POST, and authorized DELETE with unchanged success envelopes.
2. Add small typed `hasWorkspaceUser` and `hasWorkspacePromotion` helpers in the
   route (or a colocated helper only if needed to stay under the source ceiling).
   Validate the user before GET; validate both parents in parallel after body/
   query parsing and before POST/DELETE. Use the normalized workspace only.
3. Run focused tests, Inventory typecheck/build, repository, whitespace, and
   exact-scope gates. Do not touch the maintained Contacts implementation.

## Done criteria

- [ ] No service-role link read/write accepts a workspace user outside the
      normalized route workspace.
- [ ] POST and DELETE reject a promotion outside that workspace before mutation.
- [ ] Permission, app-session, success-body, referral, and Contacts contracts
      are unchanged.
- [ ] Focused tests, Inventory typecheck/build, `bun check`, and whitespace pass.

## STOP conditions

Stop on unresolved ownership, evidence that Inventory is the canonical CRM
owner, a required database invariant/migration, a supported response-contract
change, any need to edit Contacts/Rust/Web, or a mandatory gate failing twice.
