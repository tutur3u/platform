# Plan 212: Bind Workspace API-Key Roles to the Key Workspace

> **Executor instructions:** Reject foreign role ids before privileged writes,
> audit existing mismatches, and enforce API-key/role co-tenancy in PostgreSQL
> without changing valid key authentication or default-permission behavior.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/api-keys' 'apps/web/src/app/api/v1/workspaces/[wsId]/api-keys' packages/auth/src/api-keys.ts packages/auth/src/api-keys.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / security / tenant referential integrity
- **Depends on:** Plans 154 and 163; G22 route-artifact and database/type
  ownership transfer
- **Planned at:** commit `52f4aa1b12`, 2026-08-10

## Why this matters

API-key create and update accept any role UUID and persist it with a service-role
client while constraining only the key to the route workspace. The foreign key
references role id alone. A key can therefore point at another tenant's role,
receive none of its intended role permissions, and be cascade-deleted when that
unrelated role is removed.

## Current state and exact contract

- POST inserts caller-selected `role_id`; PUT applies it to the route-bound key.
  Neither proves `workspace_roles.ws_id = route wsId`.
- Authentication intentionally resolves role permissions with both key
  workspace and role id, then merges workspace defaults. Preserve that logic.
- Before any migration mutation, run a read-only mismatch audit. A nonzero
  count is an operator-decision STOP; do not delete, null, or reassign rows.
- Add/verify a unique parent key on `workspace_roles(id, ws_id)`, add the key
  workspace to the child relationship through a composite
  `(role_id, ws_id) -> workspace_roles(id, ws_id)` foreign key, and preserve
  role-delete cascade for valid same-workspace keys. Keep `role_id` nullable.
- Validate role ownership before hashing/admin creation on POST and before the
  admin update on PUT. Foreign/missing roles return the same sanitized `400`
  contract and perform no write.
- Move both substantially changed route implementations/tests into their
  existing first-class destinations. There is no matching explicit override:
  leave `route-overrides.json` unchanged, regenerate the manifest's default
  first-class `legacy-next` entries, and keep unported Rust methods falling
  through.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from green Plan 154 plus completed Plan 163 after
G22/database transfer in an isolated worktree; run `bun setup` immediately.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Integrity audit | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/workspace-api-key-role-workspace.sql` | zero legacy mismatches on fresh state; composite/cascade/nullable assertions pass |
| Route tests | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/api-keys/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/api-keys/[keyId]/route.test.ts'` | foreign/missing roles fail before hashing/admin mutation; valid/null roles pass |
| Auth regression | `bun --cwd packages/auth vitest run src/api-keys.test.ts` | valid role plus default permissions and no-role defaults remain exact |
| Full DB/typegen | `bun --cwd apps/database sb:validate:isolated && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/workspace-api-key-role-workspace.sql` | full suite and generated FK shape pass |
| Route tracking | `bun web:api-routes:check && bun migration:tanstack:manifest && bun check:backend` | first-class sources tracked; unported methods still fall through |
| Web/repository | `bun run --cwd apps/web build && bun check && git diff --check` | build and all repository gates pass |

## Scope

**In scope:** API-key collection/item routes and new colocated tests; additive
audit/composite-FK migration and pgTAP; auth regression test; generated types
and route manifest. **Out of scope:** route-overrides changes, key
format/hash/prefix/index changes,
role permission semantics, default permissions, automatic legacy cleanup,
unrelated role APIs, production apply, or Rust implementation.

## Steps

1. Characterize valid/null/foreign/missing role behavior and run a read-only
   mismatch audit. Stop for operator disposition if any current row is invalid.
2. Move the two changed route/test pairs first-class. Add one shared role
   containment check before hashing/admin work and preserve every successful
   response and key-secret handling rule.
3. Add the parent composite uniqueness and child composite FK with same-tenant
   cascade semantics. Test foreign insert/update, nullable role, valid deletion
   cascade, and unrelated-role deletion isolation.
4. Run focused/full DB, typegen, Web/auth, route/backend, build, repository,
   whitespace, and final scope gates.

## Done criteria

- [ ] POST and PUT reject missing/foreign roles before privileged mutation.
- [ ] PostgreSQL enforces that any assigned role shares the key workspace.
- [ ] Valid-role cascade and nullable-role/default-permission behavior remain.
- [ ] Existing mismatches require explicit operator disposition.
- [ ] Focused/full DB, typegen, Web/auth, route/backend, build, repository, and
  whitespace gates pass.

## STOP conditions

Stop on any legacy mismatch, unclear role-delete behavior, inability to enforce
co-tenancy without destructive cleanup, response/key-secret drift, red Plan 154
baseline, ownership conflict, default-stack mutation, or a mandatory gate
failing twice.
