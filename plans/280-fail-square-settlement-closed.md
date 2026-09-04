# Plan 280: Fail Square Refund and Dispute Settlement Closed

> **Executor instructions:** Do not acknowledge a Square refund or dispute
> webhook until every required finance entry is durably present. Preserve the
> immutable source keys so provider retries remain idempotent.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/inventory-core/src/lib/inventory/commerce/finance.ts packages/inventory-core/src/lib/inventory/commerce/square/reconciliation.ts packages/inventory-core/src/lib/inventory/commerce/square/reconciliation.test.ts packages/inventory-core/src/lib/inventory/commerce/square/webhooks.ts packages/inventory-core/src/lib/inventory/commerce/square/webhooks.test.ts 'apps/inventory/src/app/api/v1/inventory/square/webhook/[wsId]/route.ts' 'apps/inventory/src/app/api/v1/inventory/square/webhook/[wsId]/route.test.ts' tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the canonically working Finance/Inventory
  handoff owns `packages/inventory-core/**` and `apps/inventory/src/**`
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / finance / webhook retries / tests
- **Depends on:** exact-path transfer from the active Finance/Inventory owner
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Refund and dispute reconciliation currently ignores the finance recorder's
returned failure state. The webhook can therefore return 200 after a transient
RPC failure or after only one side of a won-dispute hold/release pair is
durable. Square stops retrying while Tuturuuu's finance ledger remains missing
or internally inconsistent.

## Current state and exact contract

- `finance.ts:232-270` returns `status: 'error'` on RPC failure;
  `recordInventorySaleFinanceTransaction` and
  `recordInventoryFinanceAdjustment` also catch exceptions and return an error
  result instead of throwing.
- `square/reconciliation.ts:68-164` awaits those calls but ignores every
  result and returns `true`; `square/webhooks.ts:84-209` ignores the handler's
  boolean, so the Inventory route returns 200 unless an exception escapes.
- Define a **durable finance result** as `status` equal to `linked` or `pending`
  with a nonempty `entryId`. `pending` is durable and must not trigger provider
  retries merely because no compatible wallet exists. `status: 'error'`, a
  missing entry ID, or an unclassified result is undurable.
- A completed refund requires both its sale entry and
  `refund:<refundId>` adjustment to be durable. A dispute requires its sale and
  `dispute:<disputeId>:hold`; state `WON` additionally requires
  `dispute:<disputeId>:release`. Any undurable required result throws one typed,
  sanitized reconciliation error after all preceding durable writes remain
  reusable through their source keys.
- Invalid/incomplete/non-completed provider objects and a genuinely absent
  checkout remain handled as the existing `false` no-op. A recognized event
  with an undurable settlement is not a no-op.
- `processInventorySquareWebhook` must reject when recognized refund/dispute
  reconciliation rejects; the route preserves signature failures as 401 and
  maps settlement failure to its sanitized existing 500 envelope so Square can
  retry. Do not expose recorder/database messages.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Reconciliation | `bun --cwd packages/inventory-core vitest run src/lib/inventory/commerce/square/reconciliation.test.ts src/lib/inventory/commerce/square/webhooks.test.ts` | durable pending/link, returned failure, partial WON dispute, and dispatch propagation pass |
| Route | `bun --cwd apps/inventory vitest run 'src/app/api/v1/inventory/square/webhook/[wsId]/route.test.ts'` | 401, success, sanitized settlement 500, and retry behavior pass |
| Types | `bun run --cwd packages/inventory-core type-check && bun run --cwd apps/inventory type-check` | both typechecks pass |
| Inventory build | `bun run --cwd apps/inventory build` | production build exits 0 |
| Repository | `bun check && git diff --check` | canonical checks pass; whitespace output is empty |

## Scope

**In scope:** the finance-result classifier (kept in a focused module if the
orchestrator would exceed 700 LOC), Square refund/dispute reconciliation,
webhook failure propagation, the Inventory route's sanitized status mapping,
and the three existing focused test suites.

**Out of scope:** Square signature/OAuth/catalog/device/payment/terminal
behavior; changing source keys; retrying provider calls inside the request;
changing wallet/category selection; schema/RPC changes; rebuilding missing
historical entries; Polar or cash settlement.

## Steps

1. Add red tests for sale `status:error`, adjustment `status:error`, missing
   `entryId`, durable `pending`, and a WON dispute where hold succeeds but
   release fails. Assert the exact immutable source keys on every attempt.
2. Add one explicit result classifier. Require every event-specific finance
   entry named above to pass it; throw a typed reconciliation failure otherwise.
   Never treat `booked:false,status:'pending',entryId:<id>` as undurable.
3. Make webhook dispatch propagate the typed failure. Add process-level tests
   proving it rejects after an undurable refund/dispute and succeeds for a
   durable pending entry. Preserve false/no-op provider events.
4. Add route coverage proving the typed failure returns sanitized 500 and a
   provider retry reuses identical source keys; keep invalid signatures at 401.
5. Run focused tests, typechecks, Inventory build, `bun check`, whitespace, and
   exact-scope review.

## Done criteria

- [ ] No recognized refund or dispute is acknowledged unless every required
      finance entry has a durable `linked`/`pending` row and entry ID.
- [ ] A WON dispute cannot acknowledge a durable hold with an undurable release.
- [ ] Retried delivery reuses the exact sale/refund/hold/release source keys.
- [ ] Provider/database details never enter the HTTP 500 body.
- [ ] Focused tests, typechecks, Inventory build, repository, and whitespace
      gates pass.

## STOP conditions

Stop if ownership is not transferred; a durable `pending` row lacks an entry ID;
Square delivery has no usable retry behavior; immutable source keys have drifted;
the correct fix requires a new persistence claim or migration; another lane is
changing finance settlement; or a mandatory gate fails twice.

## Maintenance notes

Recorder functions deliberately return structured outcomes. Every webhook
caller must inspect them; awaiting a promise is not evidence that settlement
succeeded.
