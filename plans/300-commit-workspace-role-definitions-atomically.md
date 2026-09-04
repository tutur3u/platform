# Plan 300: Commit Workspace Role Definitions Atomically

> **Executor instructions:** Make role metadata and supplied permissions one
> tenant-validating database transaction. Close the independent-FK path that
> lets a privileged caller attach permission rows to another workspace's role.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/roles/route.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/roles/[roleId]/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/roles' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — G22 owns the role route artifacts and the database/type lane must transfer
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM-HIGH
- **Category:** security / correctness / authorization integrity
- **Depends on:** Plan 154 green baseline; completed Plan 163; G22 and database/type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

Role creation commits the role before its permissions and relies on a fallible
compensating delete. Role update launches the name update and permission upsert
as independent requests. Worse, `workspace_role_permissions.ws_id` and
`role_id` have independent foreign keys, so the service-role PUT can insert a
permission row whose workspace and role belong to different tenants.

## Current state and exact contract

- `roles/route.ts:94-136` casts raw JSON, inserts `workspace_roles`, then inserts
  permissions. Lines 138-154 can return 500 after rollback deletion also fails.
- `roles/[roleId]/route.ts:75-108` casts raw JSON and runs the role update and
  permission upsert concurrently; either side may commit alone.
- `20240626191436_add_workspace_role_permissions.sql:3-23` defines independent
  `ws_id` and `role_id` foreign keys. Replace the role-only FK with a composite
  `(role_id, ws_id) -> workspace_roles(id, ws_id)` FK after adding the required
  unique parent key. Preserve `ON UPDATE CASCADE ON DELETE CASCADE`; assert the
  obsolete single-column FK is absent and only the composite tenant FK remains.
- The current grants and `FOR ALL` role-manager policies still permit direct
  authenticated writes to both `workspace_roles` and
  `workspace_role_permissions`. Revoke `INSERT`, `UPDATE`, `DELETE`, and
  `TRUNCATE` from `anon` and `authenticated` on both tables, replace the
  write-capable policies with SELECT-only equivalents that preserve the
  existing read contract, and retain table DML only for `service_role`. Direct
  Data API writes must not bypass the aggregate transaction.
- Before constraints, audit cross-workspace permission rows. STOP and require
  an operator disposition if any exist; never silently delete or re-home them.
- Add strict shared Zod input: object keys exactly `name` and `permissions`;
  trimmed name 1..100; permissions array 1..the enum cardinality; each item
  exactly `{id,enabled}`; `id` must be a current
  `workspace_role_permission`; duplicate IDs, unknown keys, malformed JSON, and
  non-objects return the existing 400 family before admin work.
- Create service-role-only private RPCs
  `private.create_workspace_role_definition(p_ws_id uuid, p_name text, p_permissions jsonb) returns uuid`
  and
  `private.update_workspace_role_definition(p_ws_id uuid, p_role_id uuid, p_name text, p_permissions jsonb) returns uuid`.
  Both validate the JSON again. Create inserts the role and supplied rows in one
  transaction. Update locks and verifies the role belongs to `p_ws_id`, updates
  its name, and upserts exactly the supplied permission IDs atomically; omitted
  permission IDs retain their current values, matching the existing PUT.
- Both RPCs are `SECURITY DEFINER`, owned by the migration owner, use a fixed
  safe `search_path` plus fully qualified objects, `REVOKE ALL` from `PUBLIC`,
  `anon`, and `authenticated`, and grant EXECUTE only to `service_role`.
- Missing or foreign update targets raise `P0001/WORKSPACE_ROLE_NOT_FOUND` and
  map to a non-disclosing 404. Invalid payload raises
  `P0001/WORKSPACE_ROLE_INVALID` and maps to the same 400 envelope. Other errors
  remain sanitized 500; success envelopes remain `{id,message:'success'}` for
  POST and `{message:'success'}` for PUT.
- Because both handlers are substantially reworked, move them and new colocated
  tests first-class under `apps/web/src/app/api/**`; delete the legacy files,
  update the existing POST override source ID, regenerate the manifest, and
  preserve Rust's existing GET-only ownership/fallthrough for mutations.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain exact G22 and
database/type transfer. Use an isolated Supabase validator; never apply to
production. Inventory callers and confirm maintained editors send the complete
permission matrix, while preserving partial PUT semantics for compatibility.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused Web | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/roles/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/roles/[roleId]/route.test.ts'` | strict bodies, tenant binding, atomic failures, and envelopes pass |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/workspace-role-definition-atomic.test.sql --typegen packages/types/src/supabase.ts` | pgTAP passes and isolated generated types are produced |
| Typegen determinism | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot"` | second isolated generation is byte-identical |
| Route artifacts | `bun web:api-routes:check && bun migration:tanstack:manifest && git diff --check -- apps/tanstack-web/migration` | wrappers and migration ownership are current |
| Web | `bun run --cwd apps/web type-check && bun run --cwd apps/web build` | Web compiles and builds |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Size | `wc -l 'apps/web/src/app/api/v1/workspaces/[wsId]/roles/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/roles/[roleId]/route.ts'` | both authored route files are below 700 lines |

## Scope

**In scope:** first-class collection/item role routes and tests; one strict
schema/helper if useful; one migration; exact pgTAP; generated types; the
existing POST override and regenerated manifest.

**Read-only evidence:** maintained role editors/internal-api callers; existing
Rust GET-only handlers.

**Out of scope:** role-member assignment, default roles, wallet whitelists,
permission-enum additions, Rust mutation ports, navigation/UI redesign.

## Steps

1. Add red route and pgTAP cases for malformed/unknown/duplicate permissions,
   failure after metadata or permission work, foreign roles, direct Data API
   mutation denial on both tables, direct invalid composite inserts, exact RPC
   ACLs, preserved reads, and concurrent updates.
2. Audit existing mismatches; stop on any row requiring data disposition. Add
   the parent unique key, replace the exact legacy role-only FK with the
   composite tenant FK, revoke direct anonymous/authenticated table DML, and
   replace write-capable role policies with SELECT-only policies without
   narrowing authorized reads.
3. Add the two private RPCs with fixed search paths, fully qualified objects,
   service-role-only EXECUTE, row locking, SQL validation, and typed errors.
4. Move both changed handlers/tests first-class, call one RPC per mutation,
   update/regenerate migration artifacts, and preserve GET/Rust behavior.
5. Run focused database/Web, deterministic typegen, route, build, repository,
   whitespace, size, and exact-scope gates.

## Done criteria

- [ ] No role metadata/permission request can partially commit.
- [ ] Permission rows cannot reference a role from another workspace through any writer.
- [ ] Anonymous/authenticated Data API callers can still perform authorized reads but cannot mutate either aggregate table directly.
- [ ] PUT preserves supplied-only upsert semantics; POST/PUT envelopes are stable.
- [ ] Direct RPC/Data API misuse and every invalid body fail closed.
- [ ] First-class Web and generated migration artifacts are current; Rust GET stays unchanged.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on active ownership; historical mismatches; caller reliance on duplicate,
unknown, empty, or cross-tenant permissions; an update contract that requires
full replacement rather than supplied-only upsert; unexpected Rust mutation
ownership; unsafe typegen drift; or any mandatory gate failing twice.

## Maintenance notes

Authorization definitions are one aggregate. Keep the composite tenant
constraint even when all application writers use the transactional RPC.
