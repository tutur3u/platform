# Admin Cost Analytics

`reconcileCosts` accepts normalized read-only evidence for one provider account,
billing currency and half-open reporting window. The window uses statement
posting dates. It can contain invoices with charges for different service dates.
The caller supplies one snapshot per lane and retains the source reference and
snapshot time. A missing or inaccessible source is `unavailable`. Mark an
incomplete import `partial`, including when some statement details are missing.
`complete` with an empty import represents a verified absence of records.

## Provider sources

| Provider | Posted costs | Usage, rates and limits |
| --- | --- | --- |
| Google Workspace | Use the issued invoice from the Admin console or the applicable reseller. Direct invoices can be exported to CSV or PDF with billing management privileges. | Subscription seat counts and per-user prices can inform an estimate. Reseller annual commitments and flexible billed seats have different semantics. [Invoices](https://knowledge.workspace.google.com/admin/billing/download-or-print-monthly-invoices) · [Reseller seats](https://developers.google.com/workspace/admin/reseller/reference/rest/v1/subscriptions) · [Rates](https://workspace.google.com/pricing.html) |
| Google Cloud | Use an invoice or statement as the control. Reconcile detailed BigQuery exports or the invoice cost table against it by billing account, invoice month and issuer where applicable, including signed credits, taxes, adjustments and rounding. | The standard export lacks resource-level data. Detailed export availability depends on setup and late usage can post to a later invoice. Aggregate sub-minor precision before tying totals to the invoice. Pricing exports are SKU rate and tier evidence. [Cost table](https://docs.cloud.google.com/billing/docs/how-to/cost-table) · [Standard export](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/standard-usage) · [Detailed export](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/detailed-usage) · [Pricing export](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/pricing-data) |
| Supabase | Use the organization invoice. Reconcile fixed subscription fees, compute credits and usage overages at the organization level. | Organization quotas pool usage across projects. Project usage and published rates can inform estimates or allocation. The upcoming invoice is a spending estimate. [Invoices](https://supabase.com/docs/guides/platform/your-monthly-invoice) · [Billing and quotas](https://supabase.com/docs/guides/platform/billing-on-supabase) · [Estimates](https://supabase.com/docs/guides/platform/cost-control) · [Rates](https://supabase.com/pricing) |
| Vercel | Use the issued team invoice. The billing CLI can list, inspect and download invoices subject to team permissions. | The FOCUS charges stream provides daily data with a maximum one-year query range. The Billing read integration scope is available to Pro and Enterprise teams. Upcoming invoices are estimates. Keep charges as provisional evidence until tied to the issued invoice. [Billing CLI](https://vercel.com/changelog/vercel-billing-cli-is-now-available) · [FOCUS charges](https://vercel.com/changelog/access-billing-usage-cost-data-api) · [Integration scope](https://vercel.com/docs/integrations/create-integration/vercel-api-integrations) · [Rates](https://vercel.com/docs/pricing) |
| Polar | Normalize recorded merchant fees into a fee statement, using ledger fee and reversal entries in their recorded settlement currency. | Orders expose platform fee information, which may overlap ledger fees. Customer sale and refund principal, customer tax and payout transfers are outside merchant fees. Published plan pricing supports estimation, and processor fees can also apply. [Finance ledger and fee rates](https://polar.sh/features/finance) · [Orders](https://polar.sh/docs/api-reference/orders/list) · [Settlement terms](https://polar.sh/legal/master-services-terms) |
| Cloudflare | Use the issued invoice as the control for fixed and usage-based charges. Billing history can contain several types of billing events for the same invoice. | Pay-as-you-go Billable Usage covers usage overages. Fixed plan charges require invoice evidence. The v2 account usage endpoint is restricted alpha and its metered usage rows exclude corrections. Use product-specific rates and allowances for estimates. [Invoices](https://developers.cloudflare.com/billing/understand/how-billing-works/) · [Billable Usage](https://developers.cloudflare.com/billing/manage/billable-usage/) · [Billing API](https://developers.cloudflare.com/api/resources/billing/) · [Rates](https://developers.cloudflare.com/billing/understand/usage-based-billing/) |

## Normalization rules

- Keep amounts as signed `bigint` minor units in the currency of the scope.
  `parseMinorUnits` accepts a decimal string and the source currency exponent.
  For higher-precision exports, aggregate at source precision and apply the
  statement's documented rounding before importing a minor-unit line.
- Assign a stable canonical ID to each statement and each line within it.
  Select a single canonical representation across invoice copies, exports,
  ledger mirrors and receipts. Identical duplicates collapse. Conflicting
  repeats fail the reconciliation. Provider corrections with separate
  identities remain signed entries. Use the net cost control for the document,
  excluding payments, prior balances and transfer activity.
- Map directly supported costs to an app or workspace. Keep known pooled
  charges as shared until a verified allocation basis covers the intended
  population. Use unallocated for unknown mappings. Weighted allocation
  snapshots include the metric, source, exact quantities and window. Signed
  largest-remainder allocation preserves each line total. The signed difference
  between statement and detail totals remains unallocated and visible on the
  affected statement.
- Keep an estimate as one provider-rated snapshot or one versioned rate-model
  snapshot with per-line evidence. Estimates may overlap posted charges. Present
  the lanes independently and use the coverage markers when showing subtotals.
- `attributedUnitCost` returns the exact ratio of posted attributed minor units
  to a complete positive denominator for the same provider, account, target and
  window. It includes both source references and every contributing line. This
  is a posting-window metric for the attributed portion. Report shared and
  unallocated costs alongside it when presenting the result.

The adapter contract exposes a cancellable read for a single normalized scope.
Provider clients, raw-source validation, canonical ID mapping, account-specific
permissions and storage belong to the integration that implements the contract.
