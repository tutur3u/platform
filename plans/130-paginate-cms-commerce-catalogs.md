# Plan 130: Paginate CMS Commerce Products and Storefront Listings

> **Executor instructions:** Replace full-catalog CMS reads and client filtering
> with typed, server-searched cursor pages. Preserve publication authorization
> and the current product stock/minimum-price semantics.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/cms/src/app/api/v1/commerce/products/route.ts apps/cms/src/app/api/v1/commerce/storefront/route.ts apps/cms/src/app/api/v1/commerce/route.test.ts apps/cms/src/features/cms-studio/products apps/cms/src/features/cms-studio/storefront apps/cms/src/lib/commerce-client.ts packages/internal-api/src apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/cms/messages/en.json apps/cms/messages/vi.json tmp/agent-coordination`
> Stop on caller, response, ownership, schema, or generated-type drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** performance / architecture
- **Depends on:** CMS redesign, Richfield CMS, Finance/Inventory migration, generated-type, and internal-api ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Products loads every active product/category/stock row and Storefront loads all
listings plus the complete product catalog. The browser then filters and renders
both arrays, while non-2xx responses are converted to empty state. Server-side
keyset search makes database, JSON, memory, and DOM work proportional to the
visible page and makes failures observable.

## Current state

- `products/route.ts:44-107` loads all products/categories, sends every product
  id through one unbounded `.in(...)`, and aggregates stock/minimum price in JS;
  category and stock errors are ignored.
- `storefront/route.ts:72-103` returns every listing; storefront/listing errors
  are ignored.
- `cms-products-client.tsx:21-49,82-130` raw-fetches the whole catalog, filters
  locally, masks errors as `[]`, and renders every match.
- `cms-storefront-client.tsx:48-110` raw-fetches both full collections and
  subtracts listing IDs in the browser. Root policy requires shared client API
  access through `packages/internal-api`, not new raw app fetches.
- Only `route.test.ts` exists and covers denial branches.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-cms-studio`, `$vercel-react-best-practices`, and
`$tuturuuu-agent-coordination`. Obtain exact transfers before starting. Create
any migration with `bun sb:new paginate_cms_commerce_catalogs`; use existing
English/Vietnamese keys where possible and run all i18n gates if copy changes.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| CMS focused | `bun --cwd apps/cms vitest run src/app/api/v1/commerce/route.test.ts src/features/cms-studio/products/cms-products-client.test.tsx src/features/cms-studio/storefront/cms-storefront-client.test.tsx` | cursor/search/error UI cases pass |
| Internal API | `bun run --cwd packages/internal-api test -- src/cms.test.ts` | typed facade URL/response tests pass |
| Database | `bun run --cwd apps/database scripts/run-supabase.js test db` | projection/cursor pgTAP passes |
| Apply/types | `bun sb:up && bun sb:typegen` | migration applies and types are deterministic |
| i18n if changed | `bun i18n:sort && bun i18n:key-parity && bun i18n:namespace-check` | exit 0 |
| Typechecks | `bun run --cwd packages/internal-api type-check && bun run --cwd apps/cms type-check` | both exit 0 |
| CMS build | `bun run --cwd apps/cms build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** product/storefront GET handlers and focused tests; CMS product and
storefront clients/tests; `packages/internal-api/src/cms.ts`,
`packages/internal-api/src/cms.test.ts`, and `packages/internal-api/src/index.ts`
for the typed facade (reuse an existing named facade if one appears); one additive
projection migration/pgTAP; generated types; CMS en/vi only for necessary
loading/error/pagination copy; README status.

**Out of scope:** storefront POST semantics, product CRUD, CMS home metrics
(Plan 129), virtualizing unrelated UI, offset pagination, production apply, and
unrelated internal-api splits.

## Git workflow

Use `perf/cms-commerce-catalog-pagination`, run `bun setup`, and commit
`perf(cms): paginate commerce catalogs`. Claim/release the commit window; do not
push unless instructed.

## Steps

### Step 1: Define exact bounded contracts

Inventory callers and prove no external consumer depends on the old arrays.
Define product query `q`, `cursor`, `limit` (default 24, min 1, max 100), and
`excludeListed` for bounded publishable search. Define listing query `cursor`,
`limit` with the same bounds. Product responses are exactly
`{ items: CmsCommerceProduct[], nextCursor: string | null }`. Storefront
responses are exactly
`{ storefront: CmsStorefrontOverview['storefront'], items: CmsStorefrontListing[], nextCursor: string | null }`;
when no storefront exists return `{ storefront: null, items: [], nextCursor: null }`.
Cursors are opaque base64url JSON containing the full stable key and version,
rejected with 400 when malformed. Products order by case-folded name then id;
listings by sort order then id. `q` performs case-insensitive matching across
both the product name and category name, preserving the current search surface.

**Verify:** route tests assert both exact envelopes, no-storefront behavior,
name/category search, default/max bounds, malformed cursor, stable tie ordering,
independent product/listing cursors, and no offset parameter.

### Step 2: Add set-wise keyset projections

Add service-role-only private functions that join category and aggregate stock
and minimum price before applying keyset/limit+1. The publishable filter must
use a server-side anti-join against the selected storefront, not a client array
subtraction. Every table is workspace/storefront scoped; set search paths and
privileges explicitly.

**Verify:** pgTAP covers 101+ products, tied names/sort orders, multi-stock rows,
archived/cross-workspace rows, absent storefront, publishable exclusion, and
page concatenation with no gaps/duplicates.

### Step 3: Add the typed internal API facade

Create bounded request/response schemas and helpers for product pages,
storefront pages, and existing publish mutation. Export through the package's
normal index. Do not add a raw client fetch or duplicate response interface in
the components.

**Verify:** internal-api tests assert encoded query parameters, omitted absent
cursors, max-bound validation, response validation, and publish request shape.

### Step 4: Migrate both clients to demand-driven pages

Use TanStack Query/infinite query through the facade. Debounce server search,
reset only the affected cursor when search changes, render bounded pages with a
localized load-more action, and keep previous data during fetch. Storefront
loads listings and publishable product search independently. Show localized
error/retry state; never turn non-2xx into empty data.

**Verify:** component tests cover initial page, load more, search reset, partial
failure isolation, retry, no full-array subtraction, and publish invalidation.

### Step 5: Run all gates

Apply/typegen, run database/route/component/internal-api suites, conditional
i18n gates, both typechecks, CMS build, `bun check`, and whitespace.

## Done criteria

- [ ] Every product/listing response is bounded to at most 100 items plus cursor metadata.
- [ ] Search, stock/minimum-price, publishability, and stable ordering are server-side.
- [ ] CMS clients use the typed facade and never mask failures as empty state.
- [ ] Page concatenation has no gaps/duplicates across tied keys.
- [ ] Database, focused, typecheck, build, i18n, repository, and whitespace gates pass.

## STOP conditions

Stop if ownership is not transferred, an untracked external caller needs the
old array contract, stable sort keys cannot be established, the projection
cannot avoid an unbounded ID list, typegen drifts outside scope, or a gate fails
twice.

## Maintenance notes

Keep overview metrics separate from browse pagination. If catalog mutations
change ordering fields, invalidate the first page and re-evaluate cursor
stability rather than patching client arrays.
