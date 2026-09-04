# Plan 155: Generate Receipts from Paid Orders

> **Executor instructions:** Stop presenting current subscription metadata as a
> paid receipt; resolve a provider-synchronized immutable paid workspace order
> and render only the financial facts recorded on that order.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/pay/src/app/api/billing/[wsId]/invoice/route.ts' 'apps/pay/src/app/[locale]/[wsId]/billing/success/page.tsx' 'apps/pay/src/app/[locale]/[wsId]/billing/success/client-component.tsx' apps/pay/src/lib apps/pay/messages packages/payment-core tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / billing
- **Depends on:** explicit transfer from the nonterminal Pay migration handoff,
  which owns `apps/pay/**` and the billing route family
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The workspace invoice endpoint labels a generated HTML document as a paid card
receipt even though it reads no payment. It uses the subscription creation date,
the product's current price, and the subscription ID, so canceled/unpaid
subscriptions and later price changes can produce materially false records.

## Current state

- `billing/[wsId]/invoice` reads `workspace_subscriptions` and the current
  product price, then always prints `Payment Receipt`, `Credit Card`, and
  `Paid`.
- The subscription row has mutable lifecycle state but no historical paid
  amount, currency, payment timestamp, payment method, or provider invoice ID.
- `workspace_orders` already stores immutable Polar order identity, workspace,
  subscription identity, paid/refunded status, amount, currency, billing reason,
  provider order ID, and provider timestamps.
- `payment/orders/[orderId]/invoice` establishes the neighboring
  `manage_subscription` authorization contract, but this plan does not change
  that provider endpoint.
- The billing success page opens the pseudo-receipt directly and has no missing
  or unpaid-record state. It enters with a specific Polar `checkoutId`; the
  receipt must be bound to that checkout rather than the latest workspace
  renewal.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-commit`, and `$vercel-react-best-practices`. Read root and Pay
`AGENTS.md`. Obtain the Pay handoff transfer, create an exact-base isolated
worktree, run `bun setup`, and inventory both cookie and Pay app-session callers.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun --cwd apps/pay vitest run 'src/app/api/billing/[wsId]/invoice/route.test.ts'` | authorization and paid-order matrix passes |
| Success UI | `bun --cwd apps/pay vitest run 'src/app/[locale]/[wsId]/billing/success/client-component.test.tsx'` | paid/missing receipt affordances pass |
| Localization | `bun i18n:sort && bun i18n:key-parity && bun i18n:namespace-check` | Pay English/Vietnamese keys remain aligned |
| Pay typecheck | `bun run --cwd apps/pay type-check` | exit 0 |
| Pay build | `bun run --cwd apps/pay build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the workspace invoice route and new focused test; a narrow
server-only paid-order resolver/HTML formatter; the billing success server page,
client receipt affordance, and focused tests; Pay EN/VI messages.

**Out of scope:** changing payment capture, order synchronization, refund
accounting, the separate Polar invoice endpoint, Finance invoices, schema
migrations, Web/Rust/TanStack route changes, or displaying any payment method or
historical product description not stored on the paid order.

## Git workflow

After transfer use `fix/pay-receipt-source` and commit
`fix(pay): generate receipts from paid orders`. Claim/release the commit window;
do not push.

## Steps

1. Require an exact `checkoutId` query parameter on the receipt route. Resolve
   the Pay/platform app-session actor with the maintained Pay target contract,
   normalize the workspace, and require `manage_subscription` before admin or
   provider access. Missing/malformed checkout IDs return exact 400; permission
   lookup failure returns sanitized 500.
2. Ask Polar for orders filtered by that exact checkout ID. Require exactly one
   matching provider order, then load the local `workspace_orders` row by both
   `polar_order_id` and normalized `ws_id`. Require local `status = 'paid'` and
   the provider order/checkout to be paid/confirmed. Zero results return the
   stable receipt 404; multiple/mismatched results return a sanitized 409 and no
   receipt. Do not fall back to the latest workspace/subscription order. Do not
   treat `pending`, `refunded`, or `partially_refunded` as paid.
3. Preserve the current downloadable HTML response only for that paid order.
   Render `workspace_orders.total_amount` as minor currency units,
   `workspace_orders.currency`, the order `created_at`, billing reason, and
   `polar_order_id`; omit payment method and mutable product/plan labels. Use
   the local order UUID in the filename and `Cache-Control: private, no-store`.
   Return exact `404 { error: 'Paid receipt not found' }` when no paid order
   exists; never fall back to subscription-derived paid HTML.
4. Extract the lookup as a server-only helper used by the receipt route and the
   success server page. Pass `receiptAvailable` plus the unchanged checkout ID
   to the client; never add a raw client API fetch. Link to
   `/api/billing/<wsId>/invoice?checkoutId=<encoded id>` only when available,
   otherwise show bilingual unavailable copy. Checkout success remains
   independent from optional receipt retrieval.
5. Test two paid renewals where the checkout selects the older order, unpaid,
   canceled subscription with a historical paid order, later catalog price
   change, refunded order, multiple provider matches, cross-workspace local
   order, permission/provider lookup failure, malformed monetary data, and a
   valid paid order whose recorded amount/currency/date remain unchanged.

## Done criteria

- [ ] No route labels subscription/catalog metadata as a payment receipt.
- [ ] Every receipt is backed by an authorized provider-synchronized paid order
      and its provider order identifier.
- [ ] Unpaid/refunded/missing records return a stable non-receipt result.
- [ ] Price changes cannot rewrite historical receipt facts.
- [ ] English/Vietnamese UI and all mandatory gates pass.

## STOP conditions

Stop on ownership, inability to associate a paid order deterministically with
the exact checkout, ambiguous refund semantics, need for schema or
provider-dashboard changes, missing/ambiguous minor-unit currency semantics, or
any gate failing twice.
