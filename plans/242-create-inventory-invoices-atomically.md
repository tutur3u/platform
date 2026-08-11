# Plan 242: Create Inventory-Backed Invoices Atomically

> **Executor instructions:** Validate and lock the sale inputs, then commit the
> invoice, lines, promotion, stock movements, and inventory audit through one
> service-role transaction. Never return a retryable error after retaining a
> partial paid invoice.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/finance/src/app/api/v1/workspaces/[wsId]/finance/invoices' packages/finance-core packages/inventory-core/src/lib/inventory/audit.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the Finance/Inventory handoff owns the route
  and shared cores; Plans 154/163 and database/type ownership must clear
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / financial integrity / transactionality
- **Depends on:** Plans 154 and 163; Finance/Inventory and database/type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The invoice POST inserts a completed, paid parent first. Product, unit, or owner
lookup failure then returns 500 without deleting it. Later line, promotion, and
stock failures use unchecked compensating deletes, so a failed rollback can
leave an orphan financial record and a retry can duplicate the sale. Existing
tests do not exercise any post-parent failure window.

## Current state and exact contract

- Preserve route auth/permissions, wallet/customer/category checks, inventory
  relation validation, custom-pricing policy, server-calculated values,
  six-decimal normalization, promotion-limit 400, and the successful response.
- Complete all read-only validation before dispatch, but revalidate mutable
  parents under lock inside the transaction: route workspace, wallet/category,
  customer, operator workspace user, each product/unit/warehouse tuple, product
  owner, and promotion/remaining use.
- Add exact service-role-only RPC
  `private.create_inventory_invoice_atomically(p_ws_id uuid,
  p_platform_creator_id uuid, p_workspace_creator_id uuid, p_price_mode text,
  p_invoice jsonb, p_lines jsonb, p_promotion_id uuid,
  p_frontend_values jsonb, p_custom_values jsonb)
  returns table(invoice_id uuid, subtotal numeric, discount_amount numeric,
  total numeric, values_recalculated boolean, rounding_applied numeric)`.
  `p_invoice` permits only `customer_id,note,notice,wallet_id,category_id,
  completed_at,valid_until`; every `p_lines` row permits
  only `product_id,unit_id,warehouse_id,amount,price,product_name,product_unit,
  owner_id,owner_name`. `p_frontend_values` permits only
  `subtotal,discount_amount,total`; `p_custom_values` is null for catalog mode
  or exactly `subtotal,discount_amount,total,rounding_applied` for custom mode.
- `p_price_mode` is exactly `catalog` or `custom`. Catalog mode locks the
  product tuples and promotion, calls the existing
  `private.calculate_invoice_values` inside the transaction, ignores caller
  line prices/totals for persistence, and returns the authoritative calculated
  values. Custom mode deliberately accepts the operator-entered line prices and
  the normalized `p_custom_values` snapshot after the route's existing
  `canCreateInventorySales` check; the RPC still validates positive quantities,
  finite nonnegative prices/totals, and every tenant relation.
- Preserve the current stock-ledger product rule: a sale may take recorded stock
  below zero. This plan does not introduce an availability rejection; it only
  locks and validates that each product/unit/warehouse tuple exists before
  appending the negative movement.
- The function inserts one `finance_invoices` row, all
  `finance_invoice_products`, optional `finance_invoice_promotions`, matching
  negative `product_stock_changes`, and one `private.inventory_audit_logs`
  `sale_created` row in the same transaction. It returns the invoice UUID only
  after every write succeeds.
- Translate exactly two known exhaustion sources—the existing
  `private.calculate_invoice_values` SQLSTATE `P0001` with message
  `Promotion usage limit reached`, and the promotion insert's `23514` with the
  same usage-limit meaning—into SQLSTATE `P0001`, message
  `PROMOTION_LIMIT_REACHED`; the route maps that exact code/message pair to the
  existing `400 {message:'Promotion usage limit reached'}`. Parent/reference mismatch
  raises SQLSTATE `P0001`, message `INVOICE_RELATION_INVALID`, mapped to
  `400 {message:'One or more invoice relations are invalid'}`. Every other
  `P0001`, `23514`, or unexpected error is a sanitized 500. No direct-write
  fallback or compensating delete remains.
- Audit persistence becomes required for this sale transition. Audit failure
  rolls back the invoice rather than logging and returning success. The audit
  row derives `actor_auth_uid` and `actor_workspace_user_id` exclusively from
  `p_platform_creator_id` and `p_workspace_creator_id`; duplicated caller-authored
  actor IDs are forbidden. Its label, summary, changed fields, and `after`
  projection are built inside the RPC from the committed invoice and lines, not
  accepted as caller-authored JSON.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`; read Finance/Inventory route-auth and relation-validation
references. Execute from completed Plan 163 only after Plan 154 is green.
Obtain exact transfer from the canonically working Finance/Inventory handoff
for `apps/finance/src/**`, `packages/finance-core/**`, and
`packages/inventory-core/**`. Never apply production migrations.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Invoice route | `bun --cwd apps/finance vitest run 'src/app/api/v1/workspaces/[wsId]/finance/invoices/route.test.ts'` | auth/calculation plus every failure/retry mapping passes |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/inventory-invoice-creation.sql && bun --cwd apps/database sb:validate:isolated` | atomic writes, locks, promotion, audit, ACLs, and full suite pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/inventory-invoice-creation.sql` | exact RPC type generated with no unrelated drift |
| Finance | `bun run --cwd apps/finance type-check && bun run --cwd apps/finance build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** invoice POST persistence seam and route tests; focused payload and
error-mapping modules under Finance Core if portable; one additive migration;
one pgTAP file; generated DB types; sale audit insertion for this transition.
Split the 1,144-line route so every substantially edited file is below 700 LOC.
**Out of scope:** invoice GET/PATCH/DELETE, subscription invoices, storefront
checkout, pricing formula changes, attachment/email delivery, generic inventory
audit behavior outside sale creation, production apply, and unrelated Finance
or Inventory route migration.

## Steps

1. Characterize exact successful body and all validation/permission errors.
   Add red tests for failures after parent insert at product, unit, owner, line,
   promotion, stock, and audit phases, plus compensating-delete failure and
   retry; prove zero partial rows is the required new invariant.
2. Move all required product/unit/owner projection reads before persistence and
   build a closed normalized RPC payload. Preserve the route's custom-pricing
   permission decision, but have catalog mode calculate authoritative values
   inside the RPC and never trust tenant or promotion/stock state without
   in-transaction revalidation.
3. Create the exact RPC with fixed `search_path`. Lock the relevant promotion
   and relation rows in deterministic UUID order, validate every parent belongs
   to `p_ws_id`, insert the parent/children/stock/audit, and return the UUID.
   Revoke the exact signature from PUBLIC, `anon`, and `authenticated`; grant
   only `service_role`.
4. Replace direct inserts and compensating deletes with one RPC call. Build the
   existing success envelope from the returned authoritative calculation row.
   Map only the exact SQLSTATE/message pairs above; log unexpected details
   server-side and return a sanitized 500. Do not report success when audit
   insert fails.
5. Add pgTAP for valid custom/catalog-priced sales, foreign/missing parents,
   promotion exhaustion, every injected write failure rollback, retry producing
   one invoice, and overlapping promotion-limited sales using a deterministic
   two-worker dblink barrier. Always release connections before fixture cleanup.
6. Run focused/full DB, isolated typegen, Finance typecheck/build, repository,
   source-size, whitespace, and exact-scope gates.

## Done criteria

- [ ] Invoice, lines, promotion, stock movements, and sale audit commit as one
      transition or not at all.
- [ ] All mutable tenant relations and promotion capacity are revalidated under
      deterministic locks.
- [ ] Failure and retry cannot retain or duplicate a partial paid invoice.
- [ ] Pricing, permissions, promotion-limit response, and success envelope stay
      compatible.
- [ ] The RPC is service-role-only; focused/full DB, typegen, Finance
      typecheck/build, repository, and whitespace gates pass.

## STOP conditions

Stop on red Plan 154 baseline, unresolved Finance/Inventory/database ownership,
historical cross-workspace relations, a supported non-inventory invoice path
sharing this persistence branch, need to change pricing or audit product policy,
production apply need, or any mandatory gate failing twice.
