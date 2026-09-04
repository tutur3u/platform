# Plan 189: Authorize and Allowlist Workspace User Fields

> **Executor instructions:** Close both direct-table permission bypass and
> admin-backed mass assignment while preserving the prepared Rust GET parity
> and the live Web response contract.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/fields' 'apps/web/src/app/api/v1/workspaces/[wsId]/users/fields' apps/backend/src/workspaces_wsid_users_fields.rs apps/backend/api/openapi.yaml apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** HIGH
- **Category:** security / authorization / API migration
- **Depends on:** Plan 154 (BLOCKED), Plan 163 (DONE); G22/backend route artifacts and database/type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Every workspace member can directly read and mutate custom-field definitions,
bypassing the API's view/update permissions. The live admin-backed POST/PUT
handlers also spread unvalidated request objects into persistence; callers with
`update_users` can mutate system fields such as `id`, `created_at`, or `ws_id`,
including moving a field into another tenant.

## Current state

- `20240326093612_add_ws_user_fields_p1.sql:18-183` defines the table, grants
  broad table privileges, and creates one member-wide ALL policy.
- The collection GET requires either `view_users_private_info` or
  `view_users_public_info`; POST and item PUT/DELETE require `update_users`.
- Collection POST and item PUT parse raw JSON without a schema and persist
  object spreads. Generated Update types allow `id`, `created_at`, and `ws_id`.
- Rust has source-parity GET handling and returns `None` for mutations, but its
  GET operation is missing from OpenAPI and the manifest still tracks both
  legacy Web files as undifferentiated `legacy-next`/`rust-backend`.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read
root/database/Web/backend AGENTS. Obtain
G22 transfer before replacing generated wrappers or route artifacts.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Web focused | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/users/fields/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/users/fields/[fieldId]/route.test.ts'` | auth/schema/containment matrix passes |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/workspace-user-field-permissions.sql` | direct CRUD matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/workspace-user-field-permissions.sql` | no unintended type drift |
| Wrapper guard | `bun web:api-routes:check` | no legacy wrapper is regenerated |
| Manifest | `bun migration:tanstack:manifest` | first-class source paths recorded; Rust GET ownership preserved |
| Backend focused | `cargo test --manifest-path apps/backend/Cargo.toml workspaces_wsid_users_fields` | GET parity passes |
| Backend full | `bun check:backend` | exit 0 |
| Web typecheck | `bun run --cwd apps/web type-check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** first-class collection/item Web routes moved from legacy and new
colocated tests; strict create/update schemas; one additive policy/grant migration;
`workspace-user-field-permissions.sql`; the existing Rust GET handler's OpenAPI
operation/tests; matching route override/manifest; generated types only if the
migration changes them.

**Out of scope:** changing field meaning/types; UI redesign; Rust mutations;
GET response/pagination changes; production migration/cutover.

## Git workflow

Use `fix/authorize-workspace-user-fields` and commit
`fix(contacts): authorize workspace user fields`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Characterize GET/POST/PUT/DELETE status and response contracts in focused
   tests. Add red cases for unknown keys, `id`, `created_at`, `ws_id`, foreign
   field ids, missing permissions, and database zero-row/error outcomes.
2. Verify each existing first-class destination is a generated, logic-free
   wrapper, delete that wrapper, then `git mv` only the corresponding legacy
   `route.ts` into the now-empty destination. There are no legacy tests to move;
   create both colocated first-class test files. Add exact Zod allowlists:
   create accepts only name, type, possible values, description, notes, and
   default value; update accepts only their optional counterparts and at least
   one field. Bind normalized route workspace and never persist body system
   fields.
3. Add a migration revoking anonymous privileges and replacing member-wide ALL
   access. SELECT requires either user-view permission; INSERT/UPDATE/DELETE
   require `update_users`; UPDATE validates old and new workspace. Preserve
   service-role behavior.
4. Add the exact collection GET operation to backend OpenAPI and cover its
   existing permission/status/response contract. Add replacement first-class
   override entries with method-specific ownership: collection GET is
   `migrated`/`rust-backend`; collection POST and item PUT/DELETE remain
   `legacy-next`/`rust-backend` with notes that Rust returns `None` and live Web
   remains authoritative. Regenerate the manifest and run the wrapper guard so
   the deleted legacy implementations cannot return.
5. Add pgTAP cases for no-view member, each view capability, updater, ordinary
   denied writes, cross-workspace move, service role, and denied-delete
   preservation. Run every Web/DB/Rust/build/repository gate.

## Done criteria

- [ ] Direct access matches view/update capabilities, not membership alone.
- [ ] Request bodies cannot mutate system or tenant fields.
- [ ] Collection GET is accurately registered as Rust-migrated; live Web owns
      POST/PUT/DELETE and Rust mutation fallthrough stays accurate.
- [ ] Legacy implementations are deleted and wrapper/manifest guards pass.
- [ ] Focused/full DB, Web tests/build, backend, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, unsupported external request fields, Web/Rust GET
drift, an inability to preserve method-level fallthrough in the manifest,
legacy cross-tenant rows, unexpected typegen drift, red Plan 154, environment
build failure twice, or any mandatory gate failing twice.
