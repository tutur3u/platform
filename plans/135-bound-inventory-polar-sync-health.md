# Plan 135: Bound Inventory Polar Sync-Health Responses

> **Executor instructions:** Keep aggregate health metrics bounded and move the
> complete listing/bundle browser to a stable cursor contract. Do not change
> reconciliation POST jobs or Polar write semantics.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-reconcile.ts packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-reconcile.test.ts packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-core.ts packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-webhooks.ts packages/inventory-core/src/lib/inventory/commerce/polar-product-sync.test.ts packages/internal-api/src/inventory.ts packages/internal-api/src/inventory.test.ts 'apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/polar-product-sync/route.ts' apps/inventory/src/components/operator/polar-sync-health-panel.tsx apps/inventory/src/components/operator/polar-sync-item-list.tsx apps/inventory/messages/en.json apps/inventory/messages/vi.json apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`
> Stop on response, schema, caller, ownership, or generated-type drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance
- **Depends on:** Finance/Inventory migration and generated-type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The operator health card reads every active listing and bundle, returns every
item, and renders the full array. A fixed-size summary therefore has database,
JSON, browser-memory, and DOM cost proportional to the whole Polar catalog.
Bounded aggregates plus an independent item cursor keep routine health checks
constant-size while preserving drill-down.

## Current state

- `polar-product-sync-reconcile.ts:180-222` selects every non-archived listing
  and bundle, including error text and external identifiers.
- `buildPolarProductSyncSummary:230-285` bounds errors to eight but appends every
  row to `items` and computes counts/latest sync in JavaScript.
- `packages/internal-api/src/inventory.ts:894-917` makes the unbounded item
  array part of the public type.
- `polar-sync-item-list.tsx:34-78` renders every returned item without cursor,
  virtualization, or demand boundary.
- The existing helper test covers three rows only; route/component pagination
  and large-catalog behavior are untested.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$vercel-react-best-practices`, and `$tuturuuu-agent-coordination`. Obtain exact
transfer from the canonically working Finance/Inventory note and generated-type
owners. Create one additive migration with
`bun sb:new bound_inventory_polar_sync_health`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Core tests | `bun run --cwd packages/inventory-core test -- src/lib/inventory/commerce/polar-product-sync-reconcile.test.ts src/lib/inventory/commerce/polar-product-sync.test.ts` | summary/page and error-state writer cases pass |
| Internal API | `bun run --cwd packages/internal-api test -- src/inventory.test.ts` | exact cursor URL/envelope tests pass |
| Inventory focused | `bun --cwd apps/inventory vitest run 'src/app/api/v1/workspaces/[wsId]/inventory/polar-product-sync/route.test.ts' src/components/operator/polar-sync-health-panel.test.tsx` | summary, page, load/error cases pass |
| Database | `bun run --cwd apps/database scripts/run-supabase.js test db` | aggregate/cursor pgTAP passes |
| Apply/types | `bun sb:up && bun sb:typegen` | migration applies; generated types are deterministic |
| i18n if changed | `bun i18n:sort && bun i18n:key-parity && bun i18n:namespace-check` | exit 0 |
| Typechecks | `bun run --cwd packages/inventory-core type-check && bun run --cwd packages/internal-api type-check && bun run --cwd apps/inventory type-check` | all exit 0 |
| Inventory build | `bun run --cwd apps/inventory build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** summary core/test; Polar sync core/webhook state writers and their
focused sync test; exact GET route and new colocated test; internal API Inventory
type/helper/test; Polar health panel/item list and focused test; one additive
timestamp-plus-aggregate/cursor migration and pgTAP; generated types; Inventory
en/vi only if new page/error copy is necessary; README status.

**Out of scope:** reconciliation POST, product/bundle business-field writes,
retry jobs, provider calls, virtualizing unrelated lists, offsets, production
apply, other Inventory analytics, and internal-api splitting.

## Git workflow

After transfer use `perf/bound-polar-sync-health`, run `bun setup`, and commit
`perf(inventory): bound Polar sync health`. Claim/release the commit window; do
not push unless instructed.

## Steps

### Step 1: Freeze exact summary and page contracts

The summary response contains listing/bundle counts, latest successful sync,
and at most eight error samples; it contains no full `items` array. Add nullable
`polar_error_at` to listings, bundles, and listing variants. Every new failed
push/archive records the same operation timestamp in that column; successful,
disabled, and webhook-synchronized transitions clear it with
`polar_last_error`. Do not invent a historical timestamp: pre-migration error
rows remain null and sort after timestamped errors by kind/name/id. The error
envelope exposes `erroredAt: string | null`, ordered non-null newest-first then
the documented stable legacy fallback.
The item request accepts `kind`, `status`, opaque cursor, and `limit` (default
50, min 1, max 100), ordered by kind then case-folded name then id. It returns
exactly `{ items, nextCursor }`. Malformed cursors return 400.

**Verify:** route/internal-api tests assert exact envelopes, bounds, filters,
stable ties, invalid cursor, empty state, and backward-incompatible old-array
absence.

### Step 2: Aggregate and page in the database

Add `polar_error_at` to all three product-sync tables without a guessed
historical backfill. Update every core failure/success/disabled and webhook
success transition atomically with its error text/status. Add service-role-only
private functions: one set-based aggregate over active listings/bundles and one
keyset item page using limit+1. Scope every source row to normalized workspace,
set search path/privileges explicitly, order timestamped errors newest-first and
null legacy rows by stable keys, and never place an unbounded ID array in SQL or
JS.

**Verify:** writer tests prove failure stamps and success/disabled/webhook paths
clear both error fields. pgTAP covers 101+ mixed rows, all statuses, tied names,
archived/cross-workspace exclusion, latest sync, eight newest timestamped
errors, deterministic null legacy errors, filters, and page concatenation
without gaps/duplicates.

### Step 3: Split typed summary and page helpers

Update the internal API schema/type and helper without creating a second raw
fetch path. Preserve the existing summary helper name only if callers can no
longer mistake it for a full catalog response; add an explicit page helper.

**Verify:** internal-api tests prove encoding/validation and reject oversized or
malformed responses.

### Step 4: Make item browsing demand-driven

Render counts/errors immediately from the bounded summary. Load the first item
page only when the operator opens the item browser, then request further pages
explicitly with localized loading/error/retry/load-more state. Do not hide
non-2xx as an empty array.

**Verify:** component tests cover unopened/no item call, opening, load more,
filter reset, empty state, retry, and summary remaining visible on page failure.

### Step 5: Run all gates

Apply/typegen, run database/core/route/component/internal-api suites, conditional
i18n, typechecks, Inventory build, `bun check`, and whitespace.

## Done criteria

- [ ] Routine summary size is constant and contains at most eight errors.
- [ ] New error timestamps are truthful; legacy unknown timestamps remain null and deterministic.
- [ ] Item browse requests return at most 100 stable keyset rows.
- [ ] No unbounded catalog array or `.in(allIds)` is materialized.
- [ ] Browser loads item pages only on demand and surfaces failures.
- [ ] Database, focused, typecheck, build, repo, and whitespace gates pass.

## STOP conditions

Stop if ownership is not transferred, another caller requires the old `items`
array, stable unique ordering cannot be established, the functions require
caller-selected workspace authority, typegen drifts outside scope, or a gate
fails twice.

## Maintenance notes

Keep sync execution/retry independent from this read contract. If operators
need export later, build a separate resumable export rather than removing page
bounds.
