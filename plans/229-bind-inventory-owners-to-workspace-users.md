# Plan 229: Bind Inventory Owners to Workspace Users in the Same Workspace

> **Executor instructions:** Reject every non-null owner-to-user link that does
> not belong to the normalized Inventory workspace, then enforce the invariant
> in PostgreSQL so service-role and non-HTTP writers cannot bypass it.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/owners' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the working Finance/Inventory owner and the
  Inventory revenue-bundles handoff must transfer the exact app/migration paths
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / tenant isolation / data integrity
- **Depends on:** Plans 154 and 163; Finance/Inventory application and Inventory
  migration ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Inventory owner POST/PATCH authorizes workspace A, then writes a caller-selected
`linked_workspace_user_id` through the service-role client without proving that
user belongs to A. The database stores independent foreign keys, so a manager
who knows a workspace-user UUID from B can persist cross-tenant revenue-share
attribution and expose that foreign identifier in catalog/reporting output.

## Current state and exact contract

- `.../inventory/owners/route.ts` validates UUID shape only and inserts
  `{ws_id, linked_workspace_user_id}` after checking setup permission in the
  route workspace.
- `.../inventory/owners/[ownerId]/route.ts` scopes the owner row to `ws_id`, but
  PATCH never scopes the replacement linked user.
- `private.inventory_owners` has independent foreign keys for `ws_id` and
  `linked_workspace_user_id`. Migration `20260603001609_bind_invoice_customers_to_workspace.sql`
  already provides `public.workspace_users (ws_id, id)` as a composite unique
  target.
- Preserve nullable links and current success bodies. A supplied foreign or
  absent linked user returns `400 {message:'Linked workspace user does not belong to this workspace'}`;
  lookup errors return the existing sanitized 500 style. Omitted PATCH fields
  remain unchanged; explicit `null` unlinks.
- The database constraint must preserve deletion semantics by nulling only
  `linked_workspace_user_id`, never the owner's non-null `ws_id`.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from the completed Plan 163 isolated-typegen base
after Plan 154 is green. Do not start while the canonical Finance/Inventory
note is `working` or the revenue-bundles note is `handoff` for these paths.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused routes | `bun --cwd apps/inventory vitest run 'src/app/api/v1/workspaces/[wsId]/inventory/owners/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/inventory/owners/[ownerId]/route.test.ts'` | valid/null/foreign/error POST and PATCH cases pass |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/inventory-owner-workspace-binding.sql && bun --cwd apps/database sb:validate:isolated` | audit, composite FK, delete behavior, and full suite pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/inventory-owner-workspace-binding.sql` | generated types reflect the applied schema; no unrelated drift |
| Inventory | `bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** the two owner mutation routes and new colocated tests; one additive
migration; one focused pgTAP file; generated database types. **Out of scope:**
owner GET shape, revenue formulas/payout behavior, product response shapes,
workspace-user identity merging, UI/messages, production migration apply, or
other Inventory relationship tables.

## Steps

1. Add route tests that prove valid same-workspace and null links succeed;
   foreign/absent links and lookup errors fail before insert/update/audit log;
   omitted PATCH link remains unchanged.
2. Add a small shared route helper that queries `workspace_users` by both `id`
   and normalized `ws_id`. Call it only for non-null supplied links before any
   service-role owner mutation.
3. Create a migration that first aborts with a named exception if any existing
   non-null owner link lacks a matching `(ws_id,id)` user. Only after that audit
   passes, drop exact legacy constraint
   `inventory_owners_linked_workspace_user_id_fkey`, then add named constraint
   `inventory_owners_linked_workspace_user_workspace_fkey` from
   `(ws_id,linked_workspace_user_id)` to `(ws_id,id)`, using PostgreSQL 17
   column-list `ON DELETE SET NULL (linked_workspace_user_id)` semantics.
4. Add pgTAP for valid/null insert/update, both cross-tenant directions, direct
   SQL rejection, and user deletion preserving owner `ws_id`. Assert the legacy
   single-column FK is absent and exactly the named composite linked-user FK
   remains. Run isolated DB, typegen, Inventory, repository, whitespace, and
   exact-scope gates.

## Done criteria

- [ ] POST/PATCH cannot store a linked workspace user outside the authorized
      normalized workspace.
- [ ] PostgreSQL enforces the same invariant for every writer.
- [ ] Null/omitted links and user deletion preserve the intended owner row and
      non-null workspace id.
- [ ] Focused/full DB, typegen, Inventory typecheck/build, repository, and
      whitespace gates pass.

## STOP conditions

Stop on nonzero legacy mismatches, unresolved exact ownership, a different
deletion contract, a red Plan 154 baseline, required payout/report behavior
change, production apply need, or any mandatory gate failing twice.
