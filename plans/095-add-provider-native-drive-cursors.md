# Plan 095: Add Provider-Native Drive Directory Cursors

> **Executor instructions:** Replace offset/total assumptions with a bounded,
> opaque cursor contract across Supabase and R2. Do not claim native support for
> search/sorts the providers cannot execute.
>
> **Drift check (run first):** `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/storage-core/src/lib/workspace-storage-provider.ts apps/drive/src 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/storage/list' 'apps/web/src/app/api/v1/workspaces/[wsId]/storage/list' packages/internal-api/src apps/backend/src/workspaces_storage_list.rs apps/backend/src/storage_list_test.rs apps/backend/api/openapi.yaml apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on storage-provider, list-contract, or migration-artifact drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** performance / correctness
- **Depends on:** G22, backend migration, and shared-storage ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

R2 rescans and sorts the full directory for every page; nested Supabase pages
perform a second all-page count traversal; root Supabase reports only current
page length as total. Drive can therefore stop after page one or approach
quadratic provider work while scrolling.

## Current state

- `workspace-storage-provider.ts:474-548` exhausts R2 continuation tokens,
  materializes/sorts all entries, then applies offset/limit.
- `:717-748` traverses every nested Supabase page solely to compute total.
- `:978-1013` reports root total as current filtered page length.
- `apps/drive/.../use-drive-queries.ts:87-127` trusts total to decide `hasNextPage`.
- the Web list route exposes offset/limit/total and remains a legacy handler.

## Required skills and preflight

Load platform and coordination skills plus `apps/backend/AGENTS.md`. Execution
is blocked by G22 migration artifacts, the active backend migration lane, and
the Inventory/shared-storage boundary. Obtain exact transfer before editing.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Storage tests | `bun --cwd packages/storage-core vitest run src/lib/workspace-storage-provider.test.ts` | multi-page provider parity passes |
| Drive tests | `bun --cwd apps/drive vitest run 'src/app/[locale]/(dashboard)/[wsId]/drive/use-drive-queries.test.tsx'` | infinite-query cursor tests pass |
| Rust parity | `cargo test --manifest-path apps/backend/Cargo.toml workspaces_storage_list` | Rust cursor/legacy compatibility tests pass |
| Backend gate | `bun check:backend` | backend/OpenAPI checks pass |
| Wrapper/manifest | `bun web:api-routes:check && bun migration:tanstack:manifest && bun migration:tanstack:check` | no route-tracking drift |
| Builds | `bun run --cwd apps/web build && bun run --cwd apps/drive build` | both exit 0 |
| Repository | `bun check` | exit 0 or documented unrelated blocker |

## Scope

- storage provider list contract/implementation/tests
- typed internal API and Drive query/controller tests
- `apps/backend/src/workspaces_storage_list.rs`,
  `apps/backend/src/storage_list_test.rs`, and the exact OpenAPI contract
- collision-safe first-class extraction of the Web list handler and test
- exact override re-key and generated manifest; README status

Do not redesign storage analytics, recursive export, permissions, or silently
emulate arbitrary global sorts with an unbounded scan.

## Git workflow

After transfer, use `perf/drive-directory-cursors` in an isolated worktree and
run `bun setup`. Commit `perf(storage): add provider-native directory cursors`.

## Steps

1. Freeze current root/nested, reserved-entry, folder-first, search, and sort
   behavior for both providers, including more than two pages and equal names.
2. Define an opaque versioned cursor and response `{ items, nextCursor,
   hasMore }`; exact total is optional and must not be fabricated.
3. Map name-order R2 pages to continuation tokens and Supabase pages to bounded
   probes. For non-native search/sorts, choose a documented bounded fallback or
   STOP for an index design; never exhaust an unbounded directory per page.
4. Update the existing Rust GET handler and its test module to the same
   versioned cursor/compatibility contract, including status/cache/error parity;
   update the OpenAPI schema and run `bun check:backend`.
5. Move the Web route/test first-class with collision-safe wrapper removal,
   update the typed facade/Drive infinite query, re-key tracking, and run gates.

## Done criteria

- [ ] Root and nested pagination is complete on both providers.
- [ ] Provider requests and memory per page are bounded.
- [ ] Drive advances by cursor/`hasMore`, never an incorrect page-local total.
- [ ] Web, Rust, OpenAPI, and typed internal API expose one compatible contract.
- [ ] Provider/Drive tests, route tracking, builds, and `bun check` pass.

## STOP conditions

Stop until all three owners transfer, if a required global sort has no bounded
implementation, if external offset clients cannot migrate compatibly, or a
gate fails twice.

## Maintenance notes

Opaque cursors must be versioned and treated as short-lived traversal state,
not user-editable filters.
