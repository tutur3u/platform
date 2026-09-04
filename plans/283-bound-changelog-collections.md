# Plan 283: Bound Changelog Collections Before Rich-Content Projection

> **Executor instructions:** Define one validated list-summary contract across
> Infrastructure, internal-api, Rust, and TanStack. Keep full rich content on
> slug/detail reads and make the public page load bounded pages.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/infrastructure/src/app/api/v1/infrastructure/changelog/route.ts apps/infrastructure/src/app/api/v1/infrastructure/changelog/route.test.ts 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/changelog' packages/internal-api/src/backend.ts packages/internal-api/src/backend.test.ts apps/backend/src/changelog apps/backend/src/tests/g07.rs apps/backend/src/tests/changelog.rs apps/backend/src/tests/mod.rs apps/backend/api/openapi.yaml apps/tanstack-web/src/routes/'$locale'/changelog.tsx apps/tanstack-web/src/routes/changelog-pagination.test.tsx apps/tanstack-web/src/components/changelog tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the Rust/OpenAPI method-parity lane must
  transfer the changelog handler artifacts
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / API contract / TypeScript-Rust parity
- **Depends on:** backend/G22 exact-path transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The collection accepts arbitrary page sizes and selects every full TipTap
document. The public TanStack page deliberately requests 1,000 rows at once,
while the typed client advertises `q` that neither live implementation applies.
This makes one public view transfer the largest available rich-content page and
silently return unsearched data.

## Current state and exact contract

- Define strict query parsing shared by TypeScript/Rust semantics: `page` is an
  ASCII base-10 integer `>=1`, default 1; `pageSize` is an ASCII base-10 integer
  `1..100`, default 20; malformed, signed-prefix/trailing-junk, zero, negative,
  or oversized values return
  `400 {"message":"Invalid query parameters"}`.
- `published` remains admin-only and accepts only absent, `true`, or `false`;
  `category` remains optional but must be one of the six create-schema values.
  `q` is trimmed, maximum `MAX_SEARCH_LENGTH`, and performs literal
  case-insensitive substring search over `title`, `summary`, and `version`.
  Escape PostgREST wildcard/control characters; `%`, `_`, comma, parentheses,
  and backslash are literals, not query grammar.
- The collection projection is exactly `id,title,slug,summary,category,version,cover_image_url,is_published,published_at,created_at,updated_at`.
  It excludes `content` and `creator_id`. Slug/detail reads retain the full
  current `ChangelogEntry` contract.
- Order all collection pages by `published_at DESC NULLS LAST, created_at DESC,
  id DESC`; preserve exact count and the existing `{data,pagination}` envelope.
- Split internal types into `BackendInfrastructureChangelogListEntry` and the
  full detail entry; no optional `content` escape hatch on list rows.
- TanStack public route loads 20 initially and exposes deterministic next-page
  loading until `page >= totalPages`; it must not auto-drain all pages. Preserve
  grouping, locale, detail links, public cache headers, and the empty/error UI.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Infrastructure | `bun --cwd apps/infrastructure vitest run src/app/api/v1/infrastructure/changelog/route.test.ts` | validation, literal search, projection, ordering, public/admin, and page tests pass |
| Internal API | `bun --cwd packages/internal-api vitest run src/backend.test.ts` | closed types/query encoding pass |
| TanStack | `bun --cwd apps/tanstack-web vitest run src/components/changelog src/routes/changelog-pagination.test.tsx` | bounded initial/load-more/error/grouping behavior passes |
| Rust | `cd apps/backend && cargo test changelog` | parser, query, projection, order, filters, errors, and envelopes pass |
| Apps | `bun run --cwd apps/infrastructure type-check && bun run --cwd apps/tanstack-web type-check && bun run --cwd apps/infrastructure build && bun run --cwd apps/tanstack-web build` | both apps compile/build |
| Backend/repository | `bun check:backend && bun check && git diff --check` | OpenAPI/backend, canonical, and whitespace gates pass |

## Scope

**In scope:** Infrastructure changelog GET only and a new route test; internal-
api changelog list query/types/tests; Rust changelog GET/parser/tests and its
OpenAPI list schema; TanStack public list route, list-only types/components, and
focused pagination tests. Move existing changelog tests out of the 570-line
`apps/backend/src/tests/g07.rs` into
`apps/backend/src/tests/changelog.rs`, register it in `tests/mod.rs`, and place
the expanded matrix there before `g07.rs` can approach the 700-line ceiling.

**Out of scope:** changelog POST/PUT/DELETE/publish, slug/detail projection,
database schema/indexes, editor UI, release changelogs, cursor pagination,
route ownership/cutover status, or changing public cache duration.

## Steps

1. Extract the existing Rust changelog cases from `tests/g07.rs` into the new
   sibling `tests/changelog.rs` without behavior change, register the module,
   and prove the existing filter still passes. Then add matching red
   TypeScript/Rust matrices for defaults, every invalid bound,
   categories/published, literal special-character search, public/admin filters,
   equal-timestamp ID tie-breaks, exact counts, and no `content`/`creator_id`.
2. Implement the closed query schema and list projection in Infrastructure.
   Keep permission fallback and sanitized database failure unchanged.
3. Mirror the exact parser, escaped search, select list, and order in Rust;
   update OpenAPI parameters/400 response and split list/detail schemas.
4. Tighten internal-api query/list types and tests. Remove `q` only if both
   implementations cannot support the exact literal contract; do not retain a
   silently ignored option.
5. Replace TanStack's 1,000-row request with page size 20 and a user-triggered
   next-page query that appends/deduplicates by ID. Add the `loadMore` field to
   the existing English/Vietnamese `getChangelogCopy` contract in
   `changelog-copy.ts`; do not introduce an unrelated message-bundle seam.
6. Run focused, type, build, backend, repository, whitespace, and scope gates.

## Done criteria

- [ ] Collection inputs are closed and page size cannot exceed 100.
- [ ] List responses exclude rich `content` and `creator_id`; detail remains full.
- [ ] Search is implemented identically and treats special characters literally.
- [ ] TypeScript/Rust order and envelopes are identical and gap-free under ties.
- [ ] Public TanStack renders bounded pages without auto-draining history.
- [ ] Focused/app/build/backend/repository gates pass.

## STOP conditions

Stop if backend ownership is not transferred; a supported caller requires full
content on collection rows; literal search cannot be encoded safely; the list
must preserve 1,000-row single-load behavior; OpenAPI parity cannot be updated;
the change requires schema/index work; or a mandatory gate fails twice.

## Maintenance notes

Collection types must never make heavyweight detail fields optional as a
compatibility shortcut. Keep list and detail projections distinct.
