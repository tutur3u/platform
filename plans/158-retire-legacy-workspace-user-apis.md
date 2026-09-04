# Plan 158: Retire Legacy Workspace-User APIs and Enforce Granular Permissions

> **Executor instructions:** Remove the obsolete non-v1 Web workspace-user
> compatibility routes and replace the table-wide member policy with the
> Contacts/users-core permission contract. Do not preserve the current
> unrestricted `select('*')`, body spread, or member-wide write access.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'apps/web/src/legacy-api-routes/workspaces/[wsId]/users' 'apps/web/src/app/api/workspaces/[wsId]/users' packages/users-core/src/routes/users apps/contacts/src/app/api apps/backend/src/workspaces_users_userid.rs apps/backend/src/dispatch/dispatch_chunk_07.rs apps/backend/src/lib.rs apps/backend/api/openapi.yaml apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** security / migration
- **Depends on:** Plans 154, 161, and 163; Contacts/users-core API ownership
  transfer; backend/G22 route-artifact transfer; database migration and
  generated-type ownership
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from reviewed Plan
  151 commit `132a9e3ebb` after Plan 154 is DONE

## Why this matters

The live non-v1 Web routes expose complete `workspace_users` rows and let every
workspace member create, mass-update, or delete profiles. The table policy
also grants every member all operations, bypassing Contacts' granular
`view_users_private_info`, `create_users`, `update_users`, and `delete_users`
boundaries for direct Supabase callers.

## Current state

- `apps/web/src/legacy-api-routes/workspaces/[wsId]/users/route.ts` performs
  `select('*')` and spreads an unrestricted request body into an insert.
- `.../users/[userId]/route.ts` passes the entire request body to `.update()`
  and exposes unaudited DELETE; generated first-class wrappers keep both files
  live under `apps/web/src/app/api/workspaces/[wsId]/users/**`.
- `20260701070408_wrap_rls_perf_initplan.sql` retains
  `Enable all access for workspace members` with membership-only `USING` and
  `WITH CHECK` on `workspace_users`.
- `packages/users-core/src/routes/users/workspace-user-create.ts` and
  `workspace-user.ts` are the maintained strict-schema mutation contracts and
  enforce the three mutation permissions. `database.ts` is the maintained
  permission-aware private/public projection boundary.
- `apps/backend/src/workspaces_users_userid.rs` already handles GET for the
  same non-v1 item route and deliberately selects `*`; retiring or narrowing
  the Web route must retire or narrow this Rust source, its dispatch/module
  registration, tests, and OpenAPI record in the same change.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root, Web, Contacts, database, and
`apps/backend/AGENTS.md`. Obtain
the named transfers and inventory in-repo plus documented external consumers
of `/api/workspaces/:wsId/users`; STOP if a supported consumer cannot migrate
to the maintained v1 Contacts contract.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n '/api/workspaces/.*/users|api/workspaces/\$\{.*\}/users' apps packages --glob '!**/node_modules/**'` | every hit is dispositioned in the plan coordination note |
| Users-core tests | `bun run --cwd packages/users-core test -- src/routes/users/workspace-user-create.test.ts src/routes/users/workspace-user.test.ts` | all focused tests pass |
| Web route check | `bun web:api-routes:check` | removed legacy routes do not regenerate wrappers |
| Migration manifest | `bun migration:tanstack:manifest` | manifest is current and records the approved removal |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/workspace-user-permissions.sql` | all permission/projection assertions pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/workspace-user-permissions.sql` | Plan 163 generates types from the same disposable migrated stack; only the expected type diff remains |
| Backend library | `cd apps/backend && cargo test --lib` | dispatch and handler tests pass with the retired module absent |
| Full backend | `bun check:backend` | Rust formatting, clippy, native tests, and worker check pass |
| App checks | `bun run --cwd apps/contacts type-check && bun run --cwd apps/web type-check` | exit 0 |
| App builds | `bun run --cwd apps/contacts build && bun run --cwd apps/web build` | both production builds pass |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the two legacy route trees and generated wrappers; exact caller
migrations; maintained users-core handlers/tests only where compatibility
requires them; the existing Rust item handler, dispatch/module registration,
in-file tests, and `apps/backend/api/openapi.yaml`; one uniquely named permission/projection migration
and pgTAP file; route overrides/manifest; generated types.

**Out of scope:** unrelated v1 user operations, Contacts UI redesign, changing
profile field meaning, broad CRM pagination, or weakening private-field
protection to keep an unidentified caller working.

## Git workflow

Use `fix/retire-legacy-workspace-user-apis` and commit
`fix(users): retire unrestricted workspace user APIs`. Claim/release the
commit window. Do not push or apply production migrations.

## Steps

1. Inventory callers and freeze the replacement mapping to the Contacts/v1
   route family. Verify with the caller-inventory command and record zero
   undispositioned supported consumers.
2. Remove the two legacy handlers and generated wrappers; use Plan 161's
   structured retirement/relocation contract, then regenerate route artifacts.
   Retire the Rust GET plus its dispatch/module/OpenAPI entries in the same
   change; do not retain a future handler for a route the live source removed.
3. Add an additive migration that replaces membership-wide writes with
   permission-specific INSERT/UPDATE/DELETE policies. Preserve only the
   explicitly approved public profile projection; private fields must be read
   through a permission-aware RPC/handler rather than direct table `select(*)`.
4. Add pgTAP cases for ordinary member, each granular permission, private-field
   denial, cross-workspace attempts, and service-role maintenance. Run focused
   and full disposable database validation.
5. Run users-core, Web, Contacts, build, repository, typegen, and drift gates.

## Done criteria

- [ ] No live non-v1 workspace-user collection/item route remains.
- [ ] Ordinary members cannot directly create, update, or delete profiles.
- [ ] Private profile fields require `view_users_private_info` through the
      maintained projection contract.
- [ ] Each mutation permission is independently covered by route and pgTAP
      tests, including cross-workspace denial.
- [ ] Route artifacts, types, full database suite, builds, and `bun check` pass.

## STOP conditions

Stop on missing ownership transfer, a supported caller without a migration
path, ambiguous public/private field classification, unexpected schema drift,
need to weaken the permission boundary, default-stack mutation, or any gate
failing twice.
