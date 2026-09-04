# Plan 244: Bind Subscription Invoices to One Workspace Atomically

> **Executor instructions:** Validate every subscription-invoice relation
> against the normalized workspace and commit the invoice, groups, lines,
> promotion, and stock movements in one service-role transaction. No caller ID
> may connect finance or inventory state across tenants.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/finance/src/app/api/v1/workspaces/[wsId]/finance/invoices/subscription' packages/finance-core packages/internal-api/src/finance.ts packages/internal-api/src/finance.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plans 154/163/242 plus the working
  Finance/Inventory and database/generated-type owners must clear
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** security / tenant isolation / financial integrity
- **Depends on:** Plans 154, 163, and 242; Finance/Inventory and database/type
  transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The subscription-invoice route validates products and the invoice category but
inserts caller-selected group, unit, and warehouse IDs with the service role.
The relevant junction and stock tables have independent foreign keys rather
than a co-tenant invariant. A permitted invoice creator can therefore connect a
workspace invoice to another workspace's education or inventory records, and
the current compensating deletes can still leave partial paid state on failure.

## Current state and exact contract

- `apps/finance/src/app/api/v1/workspaces/[wsId]/finance/invoices/subscription/route.ts:192-253`
  deduplicates group IDs and checks only a workspace-config denylist. Lines
  452-459 insert the raw IDs without proving `workspace_user_groups.ws_id`.
- The route filters unit lookup by `ws_id` at lines 510-516 but never checks
  returned cardinality, never loads the warehouse, and persists raw unit and
  warehouse IDs into invoice lines and stock movements at lines 530-606.
- `apps/database/supabase/migrations/20260127082242_invoices_multiple_groups.sql:3-9`
  and `20240227153037_add_external_migration_tables.sql:47-57` provide only
  independent foreign keys. Existing RLS is not a defense for service-role
  writes.
- Preserve route authentication, `create_invoices`, wallet-override checks,
  blocked-group configuration, customer/category validation, prepaid range
  rules, server calculation, promotion-limit response, six-decimal storage,
  negative-stock policy, and the current 200 response envelope.
- Implement this as the subscription counterpart to Plan 242, reusing its
  closed payload/error helpers where their contract matches. Do not merge the
  standard and subscription public routes or weaken either route's distinct
  input/response contract.
- Add exact service-role-only RPC
  `private.create_subscription_invoice_atomically(p_ws_id uuid,
  p_platform_creator_id uuid, p_workspace_creator_id uuid, p_operation_id uuid,
  p_invoice jsonb, p_group_ids uuid[], p_lines jsonb, p_promotion_id uuid,
  p_frontend_values jsonb) returns table(invoice_id uuid, subtotal numeric,
  discount_amount numeric, total numeric, values_recalculated boolean,
  rounding_applied numeric)`.
- Require `Idempotency-Key: <uuid>` on the public POST. Extend
  `createSubscriptionFinanceInvoice` with required `operationId: string`, send
  that header, and retain the same UUID for retries of one unchanged logical
  request. Missing/malformed keys return
  `400 {message:'Invalid idempotency key'}` before database work.
- `p_invoice` permits exactly `customer_id,note,notice,wallet_id,category_id,
  completed_at,valid_until`; every line permits exactly `product_id,unit_id,
  warehouse_id,quantity,price`. `p_frontend_values` permits only
  `subtotal,discount_amount,total`. Reject unknown keys, empty/duplicate group
  IDs, empty lines, nonpositive/nonfinite quantities or prices, and duplicate
  line tuples after the route's current deterministic consolidation.
- Under deterministic locks, prove the invoice customer and optional workspace
  creator are workspace users in `p_ws_id`; wallet/category, every group,
  product, unit, and warehouse belong to `p_ws_id`; every product/unit/warehouse
  tuple is a valid inventory relation; and the promotion belongs to the
  workspace with remaining use. Derive stored product/unit labels from locked
  database rows, never from caller input.
- Calculate authoritative values inside the transaction using the same private
  calculation seam as Plan 242. Insert `finance_invoices`,
  `finance_invoice_user_groups`, `finance_invoice_products`, optional
  `finance_invoice_promotions`, and negative `product_stock_changes` together.
  `p_operation_id` is a required UUID with a unique private receipt so an
  ambiguous client retry returns the original invoice rather than duplicating
  paid coverage or stock movement.
- Add exact receipt table `private.subscription_invoice_operations` with
  `id uuid primary key`, `ws_id uuid not null`, `request_hash text not null`,
  `invoice_id uuid not null unique`, and timestamps. The RPC hashes the closed
  normalized payload server-side. A committed same-key/same-hash call returns
  the stored invoice row; same key with a different hash raises
  `IDEMPOTENCY_CONFLICT`. A failed transaction leaves neither receipt nor
  invoice, so the same key can retry cleanly. Revoke the table from PUBLIC,
  `anon`, and `authenticated`; grant only `service_role`.
- Add exact private receipt table
  `private.subscription_invoice_creation_operations` with `id uuid primary
  key`, `ws_id uuid not null`, `request_hash text not null`, `invoice_id uuid
  not null unique`, `subtotal numeric not null`, `discount_amount numeric not
  null`, `total numeric not null`, `values_recalculated boolean not null`,
  `rounding_applied numeric not null`, and `created_at timestamptz not null
  default now()`. The RPC derives the hash from its normalized immutable
  arguments. The same ID/hash returns the stored invoice and calculation row;
  the same ID with a different hash raises `IDEMPOTENCY_CONFLICT`. Insert the
  receipt in the invoice transaction so no pending receipt can outlive a
  rollback and a concurrent duplicate serializes on the primary key.
- Raise exact `P0001` messages `SUBSCRIPTION_INVOICE_RELATION_INVALID`,
  `PROMOTION_LIMIT_REACHED`, and `IDEMPOTENCY_CONFLICT`. Map relation invalid to
  `400 {message:'One or more subscription invoice relations are invalid'}`,
  preserve the existing promotion 400, map idempotency conflict to 409, and
  sanitize all unexpected 500 responses. No direct-write or compensating-delete
  fallback remains.
- Add database-level co-tenancy for the invoice/group junction by adding
  `ws_id uuid`, backfilling it from `finance_invoices`, rejecting historical
  mismatches, making it non-null, and adding composite foreign keys
  `(invoice_id,ws_id)` and `(user_group_id,ws_id)` after the corresponding
  parent composite unique constraints. Keep its current composite primary key
  and reads compatible. The transactional RPC remains responsible for the
  product/unit/warehouse tuple invariant shared with Plan 242; do not add a
  second conflicting stock trigger if Plan 242 already landed an equivalent
  invariant.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`; read Plan 242's landed invoice RPC and Finance/Inventory
relation helpers before designing shared code. Execute from completed Plan 163
only after Plan 154 and Plan 242 are DONE. Obtain exact transfer from the
canonically working Finance/Inventory owner. Never apply production migrations.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Finance route | `bun --cwd apps/finance vitest run 'src/app/api/v1/workspaces/[wsId]/finance/invoices/subscription/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/finance/invoices/subscription/context/route.test.ts'` | auth, relation rejection, calculation, replay, and response compatibility pass |
| Typed client | `bun --cwd packages/internal-api vitest run src/finance.test.ts` | required idempotency header and unchanged body/envelope pass |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/subscription-invoice-creation.sql && bun --cwd apps/database sb:validate:isolated` | tenant invariants, transaction rollback, concurrency, ACLs, and full suite pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/subscription-invoice-creation.sql` | exact RPC/junction types generated without unrelated drift |
| Finance | `bun run --cwd apps/finance type-check && bun run --cwd apps/finance build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** subscription invoice POST persistence seam and existing tests;
portable closed payload/error helpers in Finance Core; the exact internal-api
helper and focused test; one additive migration; one pgTAP file; generated
database types; composite invoice/group containment and operation receipt.
Split the 677-line route before substantial editing so each authored module
remains below 700 LOC. **Out of scope:** standard invoice
behavior already owned by Plan 242, subscription context response redesign,
pending-invoice business rules, pricing or negative-stock policy changes,
invoice update/delete, checkout/provider flows, production apply, and unrelated
Finance/Inventory migrations.

## Steps

1. Characterize the successful envelope, calculation inputs, group blocking,
   line consolidation, and error mappings. Add red tests for foreign/missing
   group, unit, warehouse, customer, wallet, category, and promotion; partial
   lookup cardinality; every post-parent write failure; cleanup failure; and
   same-operation retry.
2. Reuse Plan 242's closed invoice-line builder where compatible. Add the
   required UUID header to the internal-api helper, pass it unchanged to the
   RPC, emit only the exact RPC keys, and perform cheap route validation without
   treating it as the database authority.
3. Before adding constraints, run a read-only mismatch query for every existing
   invoice/group row. STOP on any mismatch. Add `ws_id`, backfill, composite
   parent uniqueness/foreign keys, indexes, and focused pgTAP without weakening
   current RLS.
4. Create the exact private RPC with fixed `search_path`, deterministic locks,
   strict JSON/array validation, workspace containment, in-transaction pricing,
   atomic inserts, and operation replay. Revoke the exact signature and receipt
   table from PUBLIC, `anon`, and `authenticated`; grant only `service_role`.
5. Replace the direct inserts and compensating deletes with one RPC call. Build
   the existing response from its returned authoritative row and map only the
   named errors. Do not retain a fallback to the old multi-write path.
6. Add pgTAP for valid one/multi-group invoices, every foreign relation,
   duplicate/malformed input, promotion exhaustion, injected rollback at every
   table, same-key replay, different-payload conflict, two-worker overlap, and
   ACLs. Release all dblink connections before fixture cleanup.
7. Run focused/full DB, isolated typegen, Finance route/context tests,
   typecheck/build, repository, source-size, whitespace, and exact-scope gates.

## Done criteria

- [ ] Every group, customer, wallet, category, product, unit, warehouse,
      creator, and promotion is proven to belong to the normalized workspace.
- [ ] PostgreSQL rejects a cross-workspace invoice/group junction for every
      writer, including service-role callers.
- [ ] Invoice, group links, lines, promotion, and stock movements commit once or
      leave no rows; retry returns the original invoice.
- [ ] Supported pricing, permission, coverage, promotion, negative-stock, and
      response contracts remain unchanged.
- [ ] The RPC and operation receipt are service-role-only; focused/full DB,
      typegen, Finance tests/typecheck/build, repository, and whitespace gates
      pass.

## STOP conditions

Stop on red Plan 154 baseline, Plan 242 not DONE, unresolved Finance/Inventory
or database ownership, any historical cross-workspace invoice/group relation,
an existing non-route writer that cannot supply the new junction `ws_id`, a
conflicting stock invariant from Plan 242, product/unit/warehouse relation
semantics not expressible without a product decision, production apply need, or
any mandatory gate failing twice.
