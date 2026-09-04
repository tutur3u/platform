# Plan 297: Commit Inventory Quantities and Stock History Atomically

> **Executor instructions:** Replace multi-statement stock reconciliation with
> one tenant-validating transaction so quantity and movement history can never
> partially commit.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/inventory/src/app/api/v1/workspaces/[wsId]/products/[productId]/inventory' packages/inventory-core/src/lib/inventory/stock-change.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / financial-inventory integrity
- **Depends on:** Plans 154 and 163 plus Finance/Inventory and database/type ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The stock route commits quantity rows and `product_stock_changes` in separate
requests. Failures can create phantom movements with unchanged stock or real
stock changes without audit history, and some methods still return success.
Once split, the authoritative balance can no longer be reconciled from its
movement history.

## Current state and exact contract

- Inventory route POST inserts quantities at lines 113-127 and ignores the
  later history insert result. PATCH logs deletions before deleting (260-301),
  inserts before logging (390-435), and logs updates before updating (444-480).
  DELETE logs an error but still deletes quantities and returns 200 (584-633).
- The body schema already rejects duplicate `(warehouse_id, unit_id)` keys and
  bounds amount, price, minimum, revenue-share fields, beneficiary, and note.
- Add private service-role-only RPC
  `private.set_inventory_product_stock(p_ws_id uuid, p_product_id uuid, p_actor_id uuid, p_mode text, p_inventory jsonb, p_beneficiary_id uuid default null, p_note text default null) returns jsonb`.
  Exact modes: `create` inserts only absent supplied keys and preserves other
  existing keys; `replace` makes the submitted array the complete stock set;
  `clear` requires an empty array and removes all keys. These preserve POST,
  PATCH, and DELETE meanings.
- Inside one transaction, lock the product row; require it belongs to
  `p_ws_id`; require actor and optional beneficiary `workspace_users` belong to
  the same workspace; validate every warehouse and unit (and optional
  revenue-share partner) against the same workspace; reject duplicate keys;
  derive all old/new deltas; mutate `private.inventory_products`; and insert
  exactly one `product_stock_changes` row for each nonzero amount delta.
- Preserve prices/minimums/revenue-share fields without emitting a stock
  movement when amount is unchanged. Return
  `{deleted, inserted, updated}`. Raise named P0001 messages for invalid mode,
  product, actor, beneficiary/relation, duplicate key, and create conflict;
  map them to current 400/404/500 envelopes without raw SQL text.
- Revoke EXECUTE from PUBLIC, anon, authenticated; grant the exact signature
  only to service_role; set a fixed safe search path and fully qualify objects.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase-postgres-best-practices`,
`$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and `$tuturuuu-commit`.
Wait for Plans 154/163 to be green and obtain both active Inventory and
database/type transfers. Use an isolated local Supabase project as prescribed
by Plan 163; never push production schema.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/inventory-product-stock-atomic.sql` | tenant, mode, delta, rollback, ACL, and concurrent cases pass |
| Focused route | `bun --cwd apps/inventory vitest run 'src/app/api/v1/workspaces/[wsId]/products/[productId]/inventory/route.test.ts'` | POST/PATCH/DELETE mapping and zero direct writes pass |
| Typegen | `bun sb:typegen && cp packages/types/src/supabase.ts /tmp/plan297-supabase.ts && bun sb:typegen && cmp /tmp/plan297-supabase.ts packages/types/src/supabase.ts` | generated output is deterministic; intentional type diff remains |
| Inventory | `bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | app compiles and builds |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** one additive migration;
`apps/database/supabase/tests/inventory-product-stock-atomic.sql`; generated DB types;
the inventory route/request/change-context files and focused route test; a
focused inventory-core helper only if needed for typed RPC result mapping.

**Out of scope:** checkout/invoice stock consumption; manual history edits;
product detail mutation (Plan 295); UI redesign; provider inventory sync;
historical movement backfill; production schema application.

## Steps

1. Add pgTAP red probes for create/replace/clear; unchanged amounts; price-only
   edits; every invalid/foreign relation; actor absence; duplicate keys;
   create conflicts; every forced mutation/history failure; ACLs; and two
   overlapping replacements serialized on the same product lock.
   Force each post-validation failure with transaction-local test triggers that
   raise only for the uniquely named fixture product, then assert both stock and
   history rolled back before dropping the trigger. For concurrency, use three
   credential-free named `dblink` connections: a setup connection begins and
   locks the fixture `workspace_products` row; dispatch replacement A and B
   asynchronously on two worker connections; assert both workers report busy
   while held; commit setup; collect both results; and assert the final stock is
   one complete submitted set (never a hybrid) and the ordered movement rows
   reconcile exactly from initial to final. In the exception block, roll back
   setup if open, drain/cancel workers, disconnect all names, and restore/delete
   fixtures. Never embed credentials or depend on result-collection timing as
   the concurrency barrier.
2. Implement the fixed-signature definer RPC with explicit validation, row
   locks, set-based old/new delta derivation, atomic stock/history writes,
   named errors, safe search path, signature-specific revoke/grant/comment.
3. Refactor all three route methods to authorize/parse as today, resolve the
   workspace actor, call only the RPC, map named errors, and revalidate the
   storefront only after confirmed commit. Remove direct stock/history writes.
4. Generate types deterministically and add route mocks for RPC success,
   expected errors, unexpected errors, and proof that no response is successful
   after an undurable result.
5. Run database, route, typegen, Inventory, repository, whitespace, and scope gates.

## Done criteria

- [ ] Every accepted stock amount change and its movement rows commit or roll back together.
- [ ] Product, actor, beneficiary, warehouse, unit, and revenue-share parents are tenant-bound.
- [ ] POST/PATCH/DELETE semantics and response counts are frozen and tested.
- [ ] Direct non-service RPC execution is denied and concurrent replacements serialize.
- [ ] All mandatory gates pass and no authored file exceeds 700 lines.

## STOP conditions

Stop on non-green Plans 154/163; missing ownership transfer; incompatible
historical semantics for POST/DELETE; pre-existing duplicate stock keys or
foreign relations; inability to represent a supported revenue-share field;
the route remaining over 700 lines after substantial edits; or a gate failing
twice.

## Maintenance notes

Stock quantity is a ledgered invariant. Future writers must use this RPC or an
equally atomic transaction, never pair two application-level writes.
