# Plan 143: Derive Storefront Conversions from Authoritative Checkout State

> **Executor instructions:** Remove checkout lifecycle events from the public
> analytics writer, tenant-bind all telemetry references, and record conversion
> transitions only from trusted checkout/provider paths.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/inventory/src/app/api/v1/inventory/storefronts/[slug]/analytics/events/route.ts' 'apps/inventory/src/app/api/v1/inventory/storefronts/[slug]/analytics/events/route.test.ts' 'apps/inventory/src/app/api/v1/inventory/storefronts/[slug]/checkouts/route.ts' 'apps/inventory/src/app/api/v1/inventory/storefronts/[slug]/checkouts/route.test.ts' packages/inventory-core/src/lib/inventory/commerce/analytics.ts packages/inventory-core/src/lib/inventory/commerce/polar-webhooks.ts packages/inventory-core/src/lib/inventory/commerce/polar.test.ts packages/inventory-core/src/lib/inventory/commerce/square/terminal.ts packages/inventory-core/src/lib/inventory/commerce/square/terminal.test.ts packages/inventory-core/src/lib/inventory/commerce/square/pos.ts packages/inventory-core/src/lib/inventory/commerce/square/pos.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Blocked by:** active Finance/Inventory migration ownership of
  `apps/inventory/src/**`, `packages/inventory-core/**`, migrations, and generated types
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / bug
- **Depends on:** exact-path transfer from
  `tmp/agent-coordination/20260709-123138-claude-finance-inventory-migration.md`
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The anonymous analytics route accepts checkout-created/failed/completed events
and arbitrary related IDs, then inserts them with service-role credentials.
Workspace dashboards count those rows directly, so public callers can forge
conversion metrics and cross-link foreign objects, while genuine completion has
no authoritative writer.

## Current state

- `analytics/events/route.ts:7-24` accepts lifecycle events, arbitrary related
  UUIDs, and unbounded JSON metadata; lines 30-60 resolve only the slug and
  perform a service-role insert.
- Migration `20260614171313_inventory_storefront_builder_auth_analytics.sql:61-88`
  uses independent FKs and no same-storefront/workspace invariant.
- Migration `20260718095942_inventory_analytics_and_storefront_setup.sql:334-350`
  counts raw lifecycle rows for the funnel.
- The storefront browser emits interaction telemetry, while the checkout route
  emits created/failed server-side; repository search finds no trusted
  `checkout_completed` writer.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| New migration | `bun sb:new bind_storefront_analytics_events` | one uniquely named migration |
| Focused route | `bun --cwd apps/inventory vitest run 'src/app/api/v1/inventory/storefronts/[slug]/analytics/events/route.test.ts'` | all cases pass |
| Checkout transitions | `bun --cwd apps/inventory vitest run 'src/app/api/v1/inventory/storefronts/[slug]/checkouts/route.test.ts'` | cash/create/failure cases pass |
| Provider transitions | `bun --cwd packages/inventory-core vitest run src/lib/inventory/commerce/polar.test.ts src/lib/inventory/commerce/square/terminal.test.ts src/lib/inventory/commerce/square/pos.test.ts` | Polar, Terminal, and POS cases pass |
| Database apply | `bun sb:up` | migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | all pgTAP passes |
| Type generation | `bun sb:typegen` | generated types match local schema |
| Inventory typecheck/build | `bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | both exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** public event route/test; Inventory checkout route/test;
`packages/inventory-core/src/lib/inventory/commerce/analytics.ts`;
`polar-webhooks.ts` plus `polar.test.ts`; Square `terminal.ts`/test and
`pos.ts`/test; one additive migration and pgTAP test; generated types; README
status.

**Out of scope:** dashboard visual redesign, historical metric rewriting without
an operator-approved audit result, payment-provider semantics, user-facing copy,
Web/Rust/TanStack routes.

## Git workflow

After ownership transfer use `fix/storefront-authoritative-conversions`, run
`bun setup`, and commit `fix(inventory): trust storefront conversion events`.

## Steps

### Step 1: Audit existing telemetry integrity

Add a read-only SQL query in the plan's pgTAP/support fixture counting
mismatched event/storefront/workspace and related-object relationships plus
lifecycle rows by type. Put the same zero-mismatch assertion in the migration
before any schema mutation, so production application fails closed. Include the
read-only query in the deployment handoff for an operator to run before rollout;
the isolated executor does not need production credentials and must not access
production. Do not delete data automatically.

**Verify:** local clean fixtures return zero and an injected mismatch makes the
migration assertion abort before schema changes; the operator handoff contains
the exact count-only SQL and expected result `0` without row contents.

### Step 2: Narrow and bound public telemetry

Make the public schema strict and allow only interaction types (`view`,
`product_view`, `banner_click`, `add_to_cart`, `remove_from_cart`,
`checkout_started`). Cap serialized metadata at 4 KiB, at 20 keys, and nesting
depth 3; measure the compact JSON with UTF-8 bytes and cap it at 4,096 bytes.
Cap quantity at 999 to match the checkout item schema. Reject
checkout-created/failed/completed.
Resolve every optional listing/section/session ID through the current storefront
and workspace before insertion. Apply the existing public abuse-control seam;
STOP if none exists rather than inventing an unauthenticated limiter.

**Verify:** focused route tests cover every accepted type, lifecycle rejection,
bounds, same-storefront references, foreign IDs, analytics-disabled behavior,
and provider/database errors.

### Step 3: Enforce tenant-consistent event relations

Create composite unique parent keys and composite foreign keys (or an equivalent
validated trigger if nullable composite FK semantics cannot preserve deletion)
so event `ws_id`, `storefront_id`, and each non-null related ID cannot disagree.
Add a partial unique index on `(checkout_session_id, event_type)` for the three
lifecycle types when `checkout_session_id IS NOT NULL`; trusted writers may
record a failure only after a durable checkout session exists. Use conflict-no-op
semantics for exact replay. The migration must abort with a clear exception if
the audit finds legacy mismatches. Preserve nullable deletion with PostgreSQL
17 column-list actions such as `ON DELETE SET NULL (listing_id)` so `ws_id` and
`storefront_id` are never nulled.

**Verify:** pgTAP covers valid interaction/lifecycle events, every cross-tenant
relationship, parent reassignment, lifecycle uniqueness/replay, and
related-object deletion without nulling tenant columns.

### Step 4: Record lifecycle events from trusted transitions

Use one idempotent helper in `analytics.ts`, keyed by checkout session +
lifecycle type. Keep create/failure calls in the Inventory checkout route. Add
completion after the cash RPC succeeds; after Polar's paid completion RPC in
`polar-webhooks.ts`; and inside `completeSquareCheckoutPayment` so both Terminal
and Square POS share it. Record only after the durable transition and make replay
a no-op. Do not add a second POS-specific writer or accept lifecycle types from
the browser route.

**Verify:** the checkout, Polar, Terminal, and POS commands prove
create/fail/complete, same-event retry idempotency, failed provider transitions,
and no public lifecycle insertion.

### Step 5: Run all gates

Apply/test/typegen locally, inspect generated diff, then run Inventory
typecheck/build, `bun check`, and whitespace.

## Done criteria

- [ ] Anonymous callers cannot write checkout lifecycle events.
- [ ] Public metadata and all references are bounded and tenant-contained.
- [ ] Database constraints reject every cross-workspace/storefront relationship.
- [ ] Created, failed, and completed events arise idempotently from trusted transitions.
- [ ] Migration fails closed on mismatches; the count-only production predeploy
      query is present for the deployment operator; all executor commands pass.

## STOP conditions

Stop without ownership transfer, if the local mismatch assertion does not fail
before mutation, if the cited cash/Polar/Square completion surfaces drift, if
public abuse control has no reusable seam, if typegen ownership changes, or a
gate fails twice. Production audit execution is an operator deployment gate,
not an executor prerequisite.

## Maintenance notes

Keep interaction telemetry best-effort and conversion lifecycle authoritative.
Future funnel changes should derive from durable checkout state where possible,
not add new browser-writable business outcomes.
