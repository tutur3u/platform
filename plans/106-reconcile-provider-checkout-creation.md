# Plan 106: Reconcile Provider Checkout Creation Before Releasing Inventory

> **Executor instructions:** Make provider dispatch recoverable before any
> remote checkout is created. Never release a reservation after an ambiguous
> remote success, and never retry by blindly creating another provider object.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/inventory-core/src/lib/inventory/commerce apps/inventory/src/app/api/v1/inventory/storefronts apps/inventory/src/app/api/cron/inventory apps/inventory/vercel.json apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on provider checkout, reservation, webhook, reconciliation, migration, or
> generated-type drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness
- **Depends on:** Finance/Inventory migration and generated-type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Square and Polar create payable remote resources before the provider identifier
is durably stored locally. A later local failure is treated as a failed checkout
and releases stock, so a still-active payment can complete after that stock has
been sold again. Retries can also create duplicate hosted checkouts.

## Current state

- `square/terminal.ts:149-182` creates a Square order and terminal checkout,
  then persists the terminal checkout id.
- Its catch at `:188-195` marks failure and releases inventory regardless of
  whether the remote terminal checkout exists; the explicit cancellation path
  at `:199-230` correctly cancels remotely before releasing.
- `polar-checkout.ts:128-171` creates a hosted checkout before persisting its id
  and URL.
- The storefront route at `checkouts/route.ts:638-670` releases the reservation
  for every Polar preparation error.
- Polar webhook handlers already use metadata `kind`, `checkoutId`, and `wsId`
  to reconcile provider events. Square already uses stable order/checkout
  idempotency keys derived from the local checkout id.
- Existing focused tests are `square/terminal.test.ts`, `polar.test.ts`, and the
  storefront `checkouts/route.test.ts`.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Remain blocked while
`20260709-123138-claude-finance-inventory-migration.md` or the Inventory
migration handoff owns `apps/inventory/src/**` and `packages/inventory-core/**`,
or while generated database types have another owner.

Before coding, verify from the installed provider SDK/types that Polar supports
one authoritative recovery mechanism: idempotency for checkout creation,
lookup/list by the stable local checkout metadata, or cancellation by the
returned id. Record the chosen documented mechanism in the test name and code
comment; do not invent an endpoint or log credentials.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| New migration | `bun sb:new add_inventory_provider_checkout_attempts` | one additive migration |
| Database apply | `bun sb:up` | migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | attempt/idempotency tests pass |
| Type generation | `bun sb:typegen` | only expected generated DB type changes |
| Core tests | `bun run --cwd packages/inventory-core test -- src/lib/inventory/commerce/square/terminal.test.ts src/lib/inventory/commerce/polar-checkout.test.ts src/lib/inventory/commerce/polar.test.ts src/lib/inventory/commerce/provider-reconciliation-sync.test.ts` | fault-injection, webhook, and recovery cases pass |
| Route test | `bun --cwd apps/inventory vitest run 'src/app/api/v1/inventory/storefronts/[slug]/checkouts/route.test.ts'` | response/release contract passes |
| Cron test | `bun --cwd apps/inventory vitest run src/app/api/cron/inventory/provider-checkout-reconciliation/route.test.ts` | auth, bounds, and result envelope pass |
| Core typecheck | `bun run --cwd packages/inventory-core type-check` | exit 0 |
| Inventory build | `bun run --cwd apps/inventory build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- Square terminal and Polar checkout creation/reconciliation modules under
  `packages/inventory-core/src/lib/inventory/commerce/`; existing Square,
  webhook, and reconciliation tests plus new `polar-checkout.test.ts`
- storefront checkout route and its existing test
- create
  `apps/inventory/src/app/api/cron/inventory/provider-checkout-reconciliation/route.ts`
  and its colocated test; add its five-minute schedule to
  `apps/inventory/vercel.json`
- one additive migration,
  `apps/database/supabase/tests/inventory-provider-checkout-attempts.sql`, and generated
  `packages/types/src/supabase.ts`
- `plans/README.md` only for status

Do not change prices, reservation quantities, checkout authorization, provider
credentials, unrelated Square POS/catalog flows, or customer-facing copy.

## Git workflow

Use branch `fix/inventory-provider-reconciliation` in an isolated worktree and
run `bun setup`. Commit `fix(inventory): reconcile provider checkout creation`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Define the durable attempt state machine

Create `private.inventory_checkout_provider_attempts`, keyed uniquely by local
checkout plus provider and a stable attempt UUID. Add both a normal unique key
on `(checkout_id, provider, attempt_id)` and a partial unique index on
`(checkout_id, provider)` while state is one of `prepared`, `dispatching`,
`remote_created`, or `reconciliation_required`; this is the database-enforced
at-most-one-active-attempt invariant. Store `prepared`,
`dispatching`, `remote_created`, `reconciliation_required`, `canceled`, and
`completed` states, provider idempotency/reference metadata, external id when
known, bounded error metadata, attempt timestamps, and lease fields. Revoke
public/anon/authenticated access; expose service-role-only transactional RPCs
to prepare, claim, record remote success, and finish an attempt. The prepare RPC
must lock the checkout row `FOR UPDATE`, return the same row for a replayed
`attempt_id`, and return a typed conflict for a different attempt while the
partial unique active row exists. It must commit before network dispatch.

### Step 2: Make Square dispatch retry-safe

Prepare/claim the attempt before creating the order. Use the attempt's stable
keys for Square order and terminal idempotency. On retry, ask Square with the
same keys and persist the returned existing resource. If local persistence
fails after remote creation, leave stock reserved and the attempt recoverable.
Release only after confirmed pre-dispatch failure or successful remote
cancellation.

### Step 3: Make Polar dispatch recoverable

Use the verified provider mechanism from preflight and include the stable local
checkout/attempt identity in metadata. A post-create persistence failure must
leave the reservation and attempt active and be recoverable without creating a
second hosted checkout. The storefront route must return HTTP 409 with header
`Retry-After: 5` and exact body
`{ code: 'provider_reconciliation_pending', message: 'Failed to create Polar checkout', retryable: true }`.
A client retry reuses the active attempt and reconciles; it never dispatches a
second create. Polar webhook reconciliation must claim/finalize the same attempt
idempotently.

### Step 4: Reconcile bounded attempts

Add `reconcileInventoryProviderCheckoutAttempts({ limit: 25, now })` to the
existing provider reconciliation module. It claims a lease-bounded batch,
queries/cancels providers using persisted identity, and finalizes/releases only
from authoritative terminal states, using provider deadlines and retry backoff.
Expose it through GET
`/api/cron/inventory/provider-checkout-reconciliation`, copying the exact
fail-closed `CRON_SECRET ?? VERCEL_CRON_SECRET` authorization and log-drain
wrapper from the checkout-expiry cron. Return 401 `{ error: 'Unauthorized' }`,
200 `{ ok: true, processed: { claimed, completed, failed, pending } }`, or
sanitized 500 `{ error: 'Internal Server Error' }`. Register `*/5 * * * *` in
`apps/inventory/vercel.json`. Never process more than 25 attempts or use
unbounded `Promise.all`.

### Step 5: Prove every failure window

Add fault injection immediately before dispatch, after provider success, during
local id persistence, during cancellation, and during webhook/retry replay.
Assert no ambiguous path releases inventory, repeated attempts return/reconcile
one provider object, and confirmed cancellation releases exactly once. The
database suite must also run two simultaneous prepare RPC calls with different
attempt UUIDs through two `extensions.dblink` async connections and prove one
active row and one typed conflict. Create committed, uniquely named checkout
fixtures through a setup connection, send both calls before collecting either
result, and clean up through a dedicated connection in normal and exception
paths; fail if any synthetic fixture remains.

## Done criteria

- [ ] A durable unique attempt exists before each provider network dispatch.
- [ ] Concurrent different attempt UUIDs cannot create two active attempts.
- [ ] Post-provider local failures retain inventory and are resumably reconciled.
- [ ] Square and Polar retries cannot create duplicate payable checkouts.
- [ ] Inventory releases only before dispatch or after authoritative failure/cancellation.
- [ ] The fail-closed five-minute reconciliation cron processes at most 25 leased attempts.
- [ ] Migration apply/tests, typegen, focused tests, build, repository gate, and whitespace pass.

## STOP conditions

Stop until all exact owners transfer their paths. After transfer, stop if Polar
has no authoritative recovery/cancellation mechanism, existing invalid provider
state needs operator disposition, the local test database cannot run two dblink
connections without inventing credentials, the migration cannot be applied
locally, the exact 409 contract needs new UI copy, or a gate fails twice.

## Maintenance notes

Provider timeouts are ambiguous outcomes, not failures. Preserve the invariant
that a locally released reservation cannot coexist with a potentially payable
remote checkout.
