# Plan 054: Batch Task Notification Pagination

> **Executor instructions:** Replace per-type fan-out with one bounded,
> multi-type query while preserving the unified Tasks tab sort and page shape.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/tanstack-web/src/lib/notifications/notification-list-route-data.ts packages/internal-api/src apps/web/src/legacy-api-routes/v1/notifications/route.ts apps/web/src/app/api/v1/notifications apps/tanstack-web/migration`
> Stop if G22 still owns aggregate route artifacts or notification ownership changed.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Performance / Pagination
- **Depends on:** G22 route-artifact ownership release or explicit transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The Tasks tab issues one exact-count request for each of 17 notification types,
and each request fetches from row zero through `offset + pageSize`. Page 100 can
therefore request roughly 34,000 rows to render 20, with 17 database counts and
client-side merge/sort work on every load.

## Current state

- TanStack route data enumerates 17 task types and calls the API once per type.
- The notification API accepts one `type` and unbounded `limit`/`offset`.
- The internal API client has no multi-type contract.
- The live implementation remains legacy-wrapped, so substantial work must move
  it to a first-class handler and refresh migration metadata.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-development-tooling`, and
`$tuturuuu-agent-coordination`. Coordinate aggregate migration-artifact
ownership, inspect the backend notification-list gap, and preserve Next as the
live source of truth.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Web route tests | `bun run --cwd apps/web test -- src/app/api/v1/notifications/route.test.ts` | multi-type/bounds cases pass |
| Internal client tests | `bun run --cwd packages/internal-api test -- src/notifications.test.ts` | query encoding passes |
| TanStack tests | `bun run --cwd apps/tanstack-web test -- src/lib/notifications/notification-list-route-data.test.ts` | one-call pagination passes |
| Wrapper guard | `bun web:api-routes:check` | first-class move is consistent |
| Migration tracking | `bun migration:tanstack:manifest && bun migration:tanstack:check` | metadata is current |
| Backend guard | `bun check:backend` | fallback ownership remains explicit |
| Repository gate | `bun check` | exit 0 |
| App compiles | `bun run build:web && bun run --cwd apps/tanstack-web build` | both exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Move `apps/web/src/legacy-api-routes/v1/notifications/route.ts` and its test to
  `apps/web/src/app/api/v1/notifications/`.
- `packages/internal-api/src/` notification request types/client/tests.
- `apps/tanstack-web/src/lib/notifications/notification-list-route-data.ts` and
  a focused colocated test.
- Exact TanStack override key plus generated route manifest.

Do not change notification read/unread mutation semantics or mark the Rust route migrated.

## Git workflow

- Branch: `perf/batch-task-notification-pagination` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `perf(notifications): batch task tab pagination`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Define a bounded multi-type API contract

Accept a strict, deduplicated allowlist of notification types through one
documented query encoding. Preserve single-type compatibility. Cap `limit` at
100 and `offset` at 100,000, require nonnegative integers, and reject values
above those bounds. Preserve page 100 at the current 20-row page size.

### Step 2: Query and count once

Apply a database `.in('type', types)` predicate, one global ordering, one range,
and one exact count for the selected type set. Keep authorization and response
shape unchanged.

### Step 3: Replace TanStack fan-out

Request all Tasks types in one call with the actual page offset and page size.
Remove aggregate-from-zero fetching and client-side cross-response counting;
retain the same visible ordering and pagination metadata.

### Step 4: Complete first-class migration bookkeeping

Move the legacy implementation/test, update the source-file-derived override,
regenerate the manifest, and keep Rust fallback explicit until its own handler
has auth/query parity.

## Test plan

Cover single and multiple types, duplicates, invalid/unknown types, limits 100
and 101, offsets 100,000 and 100,001, empty result, exact count, global ordering, page 1/page 100, and
the assertion that the Tasks loader makes exactly one API call requesting only
`pageSize` rows.

## Done criteria

- [ ] Tasks pagination performs one bounded API/database query per page.
- [ ] API parameters cannot request unbounded materialization.
- [ ] Single-type consumers remain compatible.
- [ ] Route ownership and migration metadata are current.
- [ ] Focused tests, checks, both builds, and whitespace pass.

## STOP conditions

Stop while G22 owns aggregate artifacts, if DB ordering cannot provide the UI's
current stable tie-breaker, or if an existing consumer relies on unbounded
limits and has no migration path.

## Maintenance notes

Pagination work should scale with page size, not page number multiplied by the
number of filter values.
