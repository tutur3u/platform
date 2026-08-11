# Plan 139: Bind Linked Products to One Workspace

> **Executor instructions:** Make the Contacts/users-core route the canonical
> linked-product mutation contract, keep the Inventory compatibility handlers
> equally safe, and add a database invariant requiring the group, product,
> warehouse, and unit to share one workspace.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'packages/users-core/src/routes/user-groups/[groupId]/linked-products/route.ts' 'packages/users-core/src/routes/user-groups/[groupId]/linked-products/[productId]/route.ts' 'apps/contacts/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/route.ts' 'apps/contacts/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/[productId]/route.ts' 'apps/contacts/src/app/[locale]/[wsId]/users/groups/[groupId]/linked-products-client.tsx' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/route.ts' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/[productId]/route.ts' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`
> The Contacts wrappers/client and coordination notes are read-only evidence.
> Stop on route, schema, relationship, caller, or ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** MED
- **Category:** security / migration
- **Depends on:** Contacts/users-core, Finance/Inventory, and generated migration/type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Both the canonical Contacts/users-core handlers and the duplicate Inventory
handlers accept foreign product, warehouse, and unit IDs; item mutations do not
bind the selected association to the route workspace. A manager can create or
mutate cross-tenant relationships that contaminate CRM invoice and inventory
projections. Route checks alone would leave direct/admin writers unsafe.

## Current state

- Root `AGENTS.md` assigns workspace-user CRM ownership to Contacts with shared
  server logic in `@tuturuuu/users-core`. Contacts re-exports the two users-core
  handlers, and `linked-products-client.tsx:45-188` calls their GET/POST/PATCH/
  DELETE paths.
- Users-core collection POST validates only the group before inserting the
  caller-selected three foreign IDs. Its item PATCH/DELETE mutate by
  `group_id + product_id`; zero affected rows still report success.
- Inventory carries duplicate handlers with the same containment gaps and no
  tracked non-route caller. Preserve these compatibility URLs in this plan;
  do not claim Inventory is the canonical CRM owner.
- `workspace_user_groups`, `workspace_products`, `inventory_warehouses`, and
  `inventory_units` each carry `ws_id`; `user_group_linked_products` does not.
  Independent single-column cascade FKs do not enforce co-tenancy or protect
  against later parent `ws_id` changes.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, and `$tuturuuu-agent-coordination`. Do not
begin until Contacts/users-core, Finance/Inventory, migration, and generated
type owners transfer every exact path. Create the migration only with
`bun sb:new enforce_linked_product_workspace_consistency`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused database | `bun --cwd apps/database scripts/run-supabase.js test db supabase/tests/user-group-linked-products-workspace.sql` | all legacy-audit, FK, reassignment, and cascade cases pass |
| Full database | `bun --cwd apps/database scripts/run-supabase.js test db` | all pgTAP files pass |
| Users-core routes | `bun --cwd packages/users-core vitest run 'src/routes/user-groups/[groupId]/linked-products/route.test.ts' 'src/routes/user-groups/[groupId]/linked-products/[productId]/route.test.ts'` | all canonical containment/permission/success cases pass |
| Inventory compatibility | `bun --cwd apps/inventory vitest run 'src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/linked-products/[productId]/route.test.ts'` | compatibility handlers enforce the same boundary |
| Contacts wrapper | `bun --cwd apps/contacts vitest run 'src/app/api/v1/workspaces/[wsId]/user-groups/route-ownership.test.ts'` | canonical wrapper ownership remains registered |
| Apply/typegen | `bun sb:up && bun sb:typegen` | migration applies; generated linked-product type includes required `ws_id` |
| Typechecks | `bun run --cwd packages/users-core type-check && bun run --cwd apps/contacts type-check && bun run --cwd apps/inventory type-check` | all exit 0 |
| Builds | `bun run --cwd apps/contacts build && bun run --cwd apps/inventory build` | both production builds exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** both users-core canonical handlers and two new colocated tests;
both Inventory compatibility handlers and two new tests; Contacts route-
ownership test only if its expected inventory changes; one uniquely named
additive migration; one pgTAP file; generated DB types; README status.

**Out of scope:** Contacts UI behavior/copy, response shapes, invoice formulas,
parent CRUD, removal of compatibility URLs, unrelated RLS, Web/Rust/TanStack
routes, and cleanup of nonzero production mismatches without operator approval.

**Read-only drift evidence:** Contacts wrapper/client files, schema history, and
coordination notes.

## Git workflow

After all transfers use `fix/bind-linked-products-to-workspace`, run
`bun setup`, and commit `fix(contacts): bind linked products to workspace`.
Claim/release the commit window; do not push or apply production migrations.

## Steps

### Step 1: Audit and characterize the canonical contract

Create two-workspace fixtures and a read-only mismatch query that compares the
four parent `ws_id` values and treats a missing warehouse/unit as invalid. Add
users-core and Inventory tests for foreign/missing group, product, warehouse,
unit, mixed batches, permission denial, lookup failure, authorized create/
update/delete, duplicate insert, and zero-row mutation. Denials perform no write
or cache revalidation; Contacts wrapper ownership remains unchanged.

**Verify:** route suites fail only on missing containment/zero-row handling. The
focused pgTAP preflight reports zero mismatches on the local baseline. If any
real mismatch exists, STOP and report counts/IDs without repairing it.

### Step 2: Add a fail-closed co-tenant schema

In the generated migration, start with a `DO` assertion that aborts when any
existing linked row has a missing parent, null warehouse, or unequal parent
workspace. Add `ws_id` as nullable, backfill it from the already-verified group,
assert again that no child `ws_id` is null or differs from any parent, and only
then `ALTER COLUMN ws_id SET NOT NULL`. Add unique parent keys on `(id, ws_id)`
and composite child FKs
`(group_id,ws_id)`, `(product_id,ws_id)`, `(warehouse_id,ws_id)`, and
`(unit_id,ws_id)`. Replace the old single-column FKs while preserving their
named `ON DELETE CASCADE` behavior. Use `ON UPDATE NO ACTION` for all four
composite FKs so a referenced parent cannot move workspaces independently; do
not retain warehouse-only cascading updates. Make `warehouse_id` non-null only
after the initial audit and before validating the composite FK set. This design
must reject a later workspace reassignment on any one
parent, not only child writes. Inspect table sizes and lock behavior before
building the required parent unique keys; STOP for an operator rollout decision
if an ordinary blocking constraint build is not safely bounded.

**Verify:** focused pgTAP proves the migration assertion fails on a seeded
legacy mismatch; same-workspace writes succeed; each foreign parent and each
single-parent `ws_id` reassignment fails; deleting every parent retains the
existing cascade result.

### Step 3: Bind canonical and compatibility routes

Use normalized route workspace access in both implementations. Strictly parse
GUID bodies, fetch all requested parents with `ws_id = normalizedWsId`, and
require exact matches before writing. Include `ws_id` explicitly in inserts.
PATCH/DELETE must first resolve the existing association through route-workspace
parents; PATCH validates replacement warehouse/unit. Use `.select(...)
.maybeSingle()` (or equivalent affected-row evidence) so missing/concurrent
rows return 404. Revalidate only after a confirmed write. Keep Contacts/
users-core behavior authoritative and Inventory envelopes compatible.

**Verify:** all four route suites/wrapper tests pass and every foreign or
missing-parent case has zero write/revalidation calls.

### Step 4: Gate production rollout and run verification

Before production apply, the operator must execute the migration's exact
read-only mismatch SELECT against the target and record a zero result; a
nonzero result blocks rollout. Locally apply, run focused/full DB tests,
typegen, route tests, all typechecks/builds, `bun check`, and whitespace. Stop
on unrelated typegen or migration drift.

## Done criteria

- [ ] Contacts/users-core is tested as the canonical route authority.
- [ ] Both canonical and compatibility handlers bind every parent to the route workspace.
- [ ] Required child `ws_id` plus composite FKs prevent child writes and later parent moves from breaking co-tenancy.
- [ ] Migration and predeploy audits abort on every legacy mismatch.
- [ ] Existing cascades and public success/error envelopes remain characterized.
- [ ] DB, routes, wrappers, types, builds, repository, and whitespace gates pass.

## STOP conditions

Stop if any owner has not transferred, the audit finds mismatches, a parent no
longer has `ws_id`, composite keys cannot preserve cascade/update semantics,
the Contacts caller contract drifted, destructive cleanup is required, typegen
changes unrelated definitions, or a gate fails twice.

## Maintenance notes

Contacts/users-core owns this CRM contract. The Inventory routes are temporary
compatibility surfaces and must never become an independently evolving second
authority.
