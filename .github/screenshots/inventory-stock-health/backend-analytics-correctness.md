# Inventory financial analytics correctness report

Source-only audit at `b7201ce5f6cf437faa581bb6b59dd1f7a37d2456`. No database, fixtures, live endpoint calls or production verification performed. Stock-health mobile slice does not display these monetary fields.

## Confirmed source behavior

1. **Currency isolation is asymmetric.** `apps/database/supabase/migrations/20260722175259_inventory_analytics_checkout_sales.sql:36` starts `all_sales`; invoice branch at lines 49–67 filters workspace and product-line existence, but no currency. Checkout branch at lines 87–92 filters `upper(checkout.currency) = params.currency` and normalizes minor units at lines 74–75. `apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/analytics/summary/route.ts:40` passes workspace default currency and returns it at line 65. Thus the response label is not evidence that invoice inputs are denominated in it. A mismatch exists if product invoices in multiple wallet currencies are supported/populated; actual production population is unverified.

2. **Linked sources can both enter the union.** Same SQL lines 55–57 deliberately find the checkout linked to an invoice for channel attribution, then lines 69–92 union all completed checkouts without `finance_invoice_id IS NULL` or another anti-join. Current-summary sales counts rows and sums their values at lines 183–187. A fixture containing both eligible representations returns two rows. Whether the intended metric counts distinct commercial purchases or source records is not defined by this function; calling it unique purchases would be a confirmed mismatch for that fixture.

3. **Gross/net intent is undefined.** Checkout branch includes only `status = 'completed'`; invoice branch uses `coalesce(completed_at, created_at)` and product-line existence without equivalent completion/cancellation predicate. No refund rows/amounts are referenced. `invoice.paid_amount` and checkout `total_amount` are different money concepts. Source proves absent explicit refund adjustment, not that production refunds are lost: upstream status/amount mutation behavior must be established. `estimatedGrossProfit` at lines 374–375 multiplies revenue by costing-scenario margin; it is an estimate, not realized margin from historical cost of goods.

4. **Historical prices and reporting dates differ in certainty.** Invoice line revenue uses stored line amount × stored price; checkout lines use stored subtotal normalized by currency (lines 112–115 and 141–144). Current catalog prices are not used for this revenue calculation. Product/category/owner labels can use current metadata. Date buckets use `current_date` and timestamp `::date` (lines 20–34, 42, 77); the API lacks an explicit reporting timezone. Do not claim workspace-local day boundaries without a stated DB-session timezone contract.

## Synthetic fixture design for a later admitted DB lane

| Fixture | Inputs | Source-derived observation / decision required |
| --- | --- | --- |
| Linked purchase | USD invoice paid 10 with a persisted line; completed USD checkout 1000 minor units linked to it, same date | SQL includes two sale rows and revenue 20. If intent is commercial purchases, expected count 1/revenue 10; choose canonical record and prove invoice-only/checkout-only remain counted. |
| Mixed invoice currencies | USD wallet invoice 10; VND wallet invoice 100000; unlinked USD checkout 1000; request USD | Invoice values both enter. Desired single-currency contract should isolate USD, explicitly return separate currency groups, or reject ambiguous invoice currency; no FX conversion assumption. |
| Refunds | completed checkout 1000 USD, partial refund 400, then full refund variant; matching invoice-linked versions | Decide gross 10 vs net 6/0, refund occurrence date vs original-sale date and whether counts represent orders or refund records. Verify real refund storage/status mutation before asserting expected output. |
| Cancel/unfinished | canceled checkout, pending checkout, invoice with null completed date but created date and product lines, soft-deleted invoice if supported | Checkout excludes first two. Determine invoice eligibility from canonical ledger contract, not UI wording. Assert same predicates across linked and unlinked sources. |
| Historical price | old sale line price 10, then catalog/season price 25 | Historical revenue remains stored 10. Assert season snapshot price IDs/captured values are untouched by current-price changes; metadata attribution policy is separate. |
| Midnight boundary | sale instant near midnight; DB session UTC vs Asia/Ho_Chi_Minh; configured workspace timezone distinct | Current date bucketing can change with session timezone. Define one reporting timezone and inclusive date boundaries; previous-period alignment must use it too. |

Route tests should verify authorized canonical workspace IDs, 403, currency argument/response consistency, generatedAt passthrough, and no-store. DB tests should assert exact scalar values for each fixture, not only JSON shape. Public/other-workspace/other-actor variants must never leak data. These are proposed fixtures, not executed proof or permission for production writes.

## Stock lineage admission

`20260718095942_inventory_analytics_and_storefront_setup.sql:118` filters active products by workspace/nonarchived; lines 124–154 join stock only by product and count setup, low, out and unlimited rows. No warehouse join/filter appears, so **every proposed row metric and stocked-product count includes rows in archived warehouses**. Active-product count itself is independent of warehouse status. Low/out overlap follows independent predicates at lines 136/139. Null quantities enter unlimited only. The sales wrapper preserves these stock-summary fields (`20260722175259...sql:472`). Warehouse-health CTE has a broader archive treatment and is excluded from the mobile slice.
