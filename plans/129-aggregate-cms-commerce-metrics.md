# Plan 129: Aggregate CMS Commerce Metrics in the Database

> **Executor instructions:** Preserve the two CMS metric response shapes while
> replacing full-row transfers with service-role-only workspace aggregate RPCs.
> Treat every database error as a failure; never fabricate trustworthy-looking
> zero metrics from a failed query.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/cms/src/app/api/v1/commerce/overview/route.ts apps/cms/src/app/api/v1/commerce/insights/route.ts apps/cms/src/app/api/v1/commerce/route.test.ts apps/cms/src/lib/commerce-client.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`
> Stop on metric semantics, ownership, schema, or generated-type drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / correctness
- **Depends on:** CMS redesign, Richfield CMS, Finance/Inventory migration, and generated-type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

CMS home makes two no-store requests that transfer complete invoice, product,
stock, and listing sets to return eight scalars. Cost grows with tenant history
and catalog size, and several insights query errors are currently converted to
plausible zero values. Database aggregation makes response work constant-sized
and gives failures an explicit contract.

## Current state

- `overview/route.ts:41-55` selects every invoice's `price, paid_amount` and
  reduces the array twice.
- `insights/route.ts:43-103` selects every active product id, matching stock
  row, and storefront listing, then builds maps/sets in the route.
- Insights ignores errors from all four reads; overview checks its one query.
- `commerce-client.ts:17-33` marks both requests `cache: 'no-store'`.
- `route.test.ts:35-103` covers RBAC denial only; no success, empty, aggregate,
  or downstream-failure behavior is characterized.
- Existing `private.get_inventory_commerce_summary` has different sales/currency
  semantics and is not a substitute for these exact CMS responses.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-cms-studio`, and `$tuturuuu-agent-coordination`. Do not start until
the exact active CMS and database owners transfer these paths. Create the
migration with `bun sb:new aggregate_cms_commerce_metrics`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| CMS routes | `bun --cwd apps/cms vitest run src/app/api/v1/commerce/route.test.ts` | permission, success, empty, and failure cases pass |
| Database | `bun run --cwd apps/database scripts/run-supabase.js test db` | aggregate pgTAP assertions pass with the suite |
| Apply/types | `bun sb:up && bun sb:typegen` | migration applies and types regenerate deterministically |
| CMS typecheck | `bun run --cwd apps/cms type-check` | exit 0 |
| CMS build | `bun run --cwd apps/cms build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** overview/insights GET handlers; their shared focused route test;
one additive migration and pgTAP test; generated types; `plans/README.md` status.

**Out of scope:** product/listing pagination (Plan 130), mutation behavior,
currency conversion, cache policy, CMS home redesign/copy, shared sales-period
analytics, or production migration application.

**Read-only drift evidence:** `apps/cms/src/lib/commerce-client.ts`, current
inventory aggregate migrations, and coordination notes.

## Git workflow

Use `perf/cms-commerce-metrics` in an isolated worktree, run `bun setup`, and
commit `perf(cms): aggregate commerce metrics`. Claim/release the commit window;
do not push unless instructed.

## Steps

### Step 1: Lock exact scalar semantics

Add route and pgTAP fixtures for multiple invoices, null amounts, archived and
active products, multiple stock rows per product, total stock at/below zero,
listed/unlisted products, no storefront, and multiple storefronts (the earliest
`created_at`, then id as deterministic tie-break). Cover every read/RPC failure
as a sanitized 500.

**Verify:** focused CMS test runs and names all eight scalar fields; pgTAP file
parses and contains cross-workspace isolation assertions.

### Step 2: Add two service-role-only aggregate RPCs

Create exact functions `private.get_cms_commerce_overview(p_ws_id uuid)` and
`private.get_cms_commerce_insights(p_ws_id uuid)`. Each returns one JSON object
with the current camelCase response keys and numeric defaults. Set a safe search
path, revoke PUBLIC/anon/authenticated, grant only service_role, and scope every
relation by `p_ws_id`. Keep archived-product and earliest-storefront semantics.

**Verify:** database suite proves exact values, empty defaults, permissions,
and that another workspace's rows never affect the result.

### Step 3: Switch handlers without changing HTTP contracts

Call the private RPCs through the authorized admin client. Validate the returned
JSON shape before response mapping and return the existing generic 500 envelope
for RPC errors or malformed results. Remove full-row queries and in-memory
reductions; keep 400/403 and success bodies unchanged.

**Verify:** route tests assert one RPC call with the normalized workspace,
unchanged JSON/status, and 500 on error/malformed result.

### Step 4: Apply and run all gates

Apply/typegen, run pgTAP and CMS tests, typecheck/build, `bun check`, and
whitespace. Retain no unrelated typegen drift.

## Done criteria

- [ ] Both metric responses are constant-sized database aggregates.
- [ ] Exact existing scalar/status contracts and tenant isolation are preserved.
- [ ] Downstream failures cannot become zero-valued 200 responses.
- [ ] RPC privileges and search paths are explicitly tested.
- [ ] Database, CMS, build, repository, and whitespace gates pass.

## STOP conditions

Stop if ownership is not transferred, current metric semantics differ, an
existing RPC is proposed without exact equivalence proof, typegen includes
unrelated churn, local migration apply is unavailable, or a gate fails twice.

## Maintenance notes

These RPCs are CMS projections, not new Finance/Inventory source-of-truth
models. Add new scalar fields deliberately and keep route validation aligned.
