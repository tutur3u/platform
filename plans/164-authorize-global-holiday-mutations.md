# Plan 164: Require Mutation Permission for the Global Holiday Calendar

> **Executor instructions:** Keep holiday reads available to Infrastructure
> viewers, but require the root workspace's established
> `manage_workspace_roles` permission for every holiday mutation in TypeScript,
> Rust, and PostgreSQL. Preserve mutation validation/success bodies and holiday
> semantics while aligning Rust's auth-error statuses to the live TypeScript
> contract.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/infrastructure/src/lib/infrastructure-admin-access.ts apps/infrastructure/src/app/api/v1/internal/holidays apps/backend/src/holidays.rs apps/backend/src/tests/g05.rs apps/backend/src/tests/g06.rs apps/backend/api/openapi.yaml apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / database / migration parity
- **Depends on:** Plan 154; backend-migration, database-migration, and generated
  type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from reviewed Plan
  151 commit `132a9e3ebb` after Plan 154 is DONE

## Why this matters

The holiday calendar is global input to wallet business-day and interest
calculations. Today an Infrastructure actor with only `view_infrastructure`, or
any direct authenticated root-workspace member, can create, edit, delete, or
replace holidays. The prepared Rust route preserves the same root-membership
shortcut, so a future cutover would carry the authorization gap forward.

## Current state

- `apps/infrastructure/src/lib/infrastructure-admin-access.ts:21-38` defaults
  `authorizeInfrastructureAdminRequest` to `view_infrastructure`.
- The POST in `.../holidays/route.ts`, PUT/DELETE in
  `.../holidays/[holidayId]/route.ts`, and bulk POST in
  `.../holidays/bulk/route.ts` call that default and then use `sbAdmin`.
- `20260130230000_add_wallet_interest_support.sql:158-193` created holiday
  write policies that require only root membership. The later initplan migration
  keeps that same predicate.
- `apps/backend/src/holidays.rs:471-528` authorizes every method through root
  membership. `apps/backend/src/timezones.rs:1-180` is the matching global
  configuration exemplar: it uses the `has_workspace_permission` RPC with the
  root ID and `manage_workspace_roles`.
- The projection and summary RPCs in migrations `20260526123049` and
  `20260526124400` exclude holidays when calculating business days.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root, database, Infrastructure, and
`apps/backend/AGENTS.md`. Obtain the named ownership transfers. The Rust file is
grandfathered above 700 LOC; keep this authorization edit narrowly localized
and do not grow unrelated orchestration.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Infrastructure routes | `bun --cwd apps/infrastructure vitest run 'src/app/api/v1/internal/holidays/route.test.ts'` | all GET and mutation permission cases pass |
| Infrastructure typecheck | `bun run --cwd apps/infrastructure type-check` | exit 0 |
| Focused Rust | `cd apps/backend && cargo test --lib holidays_` | holiday authorization and response cases pass |
| Full backend | `bun check:backend` | formatting, clippy, native tests, and Worker check pass |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/vietnamese-holiday-permissions.sql` | all pgTAP permission cases pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Type drift | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/vietnamese-holiday-permissions.sql` | test passes and generated types have no diff |
| Infrastructure build | `bun run --cwd apps/infrastructure build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the three Infrastructure holiday route files and one colocated
route test; explicit permission calls (not a global default change) in the
shared Infrastructure authorizer only if required for testability; the Rust
holiday authorizer, focused tests in `g05.rs`/`g06.rs`, and holiday OpenAPI
descriptions; one uniquely named policy migration and pgTAP file; generated
types only to prove zero drift.

**Out of scope:** holiday dates/names, read visibility, wallet interest
formulas, a new permission enum, unrelated Infrastructure routes, production
migration application, or marking the Rust route as serving production.

## Git workflow

Use branch `fix/authorize-global-holiday-mutations` and commit
`fix(infrastructure): authorize holiday mutations`. Work in an isolated
worktree, run `bun setup` immediately, claim/release the commit window, and do
not push or apply production migrations.

## Steps

1. **Freeze TypeScript behavior.** Add a route test covering GET with
   `view_infrastructure`, and POST/PUT/DELETE/bulk denial for a caller that has
   view permission but not `manage_workspace_roles`. Denial must precede body
   parsing and admin database work. Preserve existing validation, duplicate,
   not-found, and success envelopes.

   **Verify:** the focused suite fails only on the current mutation boundary,
   then passes after Step 2.

2. **Require the explicit mutation permission.** Keep GET on the existing
   read boundary. Pass `'manage_workspace_roles'` explicitly to
   `authorizeInfrastructureAdminRequest` in every mutation handler. Do not
   change the helper's global default or reuse `view_infrastructure` for writes.

   **Verify:** focused tests pass and `rg -n 'authorizeInfrastructureAdminRequest\(\)' apps/infrastructure/src/app/api/v1/internal/holidays` finds only GET.

3. **Tighten direct database writes.** Add an additive migration replacing the
   three membership-only write policies with
   `has_workspace_permission(ROOT_WORKSPACE_ID, auth.uid(),
   'manage_workspace_roles')`. Preserve public SELECT. Add pgTAP cases for anon,
   ordinary root member, view-only role, role manager, non-root role manager,
   and service role across INSERT/UPDATE/DELETE.

   **Verify:** focused and full disposable database commands pass; isolated
   typegen leaves `packages/types/src/supabase.ts` unchanged.

4. **Keep Rust mutation parity.** Replace `has_root_workspace_membership` with
   the same root `has_workspace_permission` RPC contract and explicit auth-error
   classification used by `timezones.rs`. The current Rust mutation helper
   collapses missing auth and denied membership into 403; correct it to the live
   TypeScript contract: 401 for missing/invalid auth, 403 for a valid actor
   without permission, and a sanitized 500 on permission lookup failure. Do not
   change the separately existing Rust GET implementation in this plan. Extend
   `g05.rs` and `g06.rs` for all
   collection, bulk, and item mutation methods. Update OpenAPI descriptions so
   they no longer promise root-membership authorization.

   **Verify:** focused Cargo and `bun check:backend` pass.

5. **Run all remaining gates.** Run the Infrastructure typecheck/build,
   repository check, and whitespace command.

## Done criteria

- [ ] Holiday GET retains its existing read contract.
- [ ] Every TypeScript and Rust holiday mutation requires root
      `manage_workspace_roles`; membership or view permission alone is denied.
- [ ] Direct authenticated writes enforce the same permission and public reads
      remain unchanged.
- [ ] TypeScript/Rust mutation status codes and bodies are aligned; their
      pre-existing GET implementation difference is unchanged and explicitly
      out of scope.
- [ ] Focused/full database, Rust, app, build, repository, and whitespace gates
      pass with zero generated-type drift.

## STOP conditions

Stop on missing ownership transfer, Plan 154 not DONE, evidence that a supported
operator lacks a migration path to `manage_workspace_roles`, any need for a new
permission enum, unexpected/new TypeScript/Rust **mutation** response drift
beyond the specified Rust auth-status correction, default-stack mutation,
generated-type drift from this policy-only migration, or a gate failing twice.

## Maintenance notes

Future global reference-data mutations should follow the permission-based
timezone boundary, not root membership. Reviewers should confirm that all four
mutation surfaces and direct table access agree before approving.
