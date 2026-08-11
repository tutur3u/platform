# Plan 102: Bound User-Group Session Listings in TypeScript and Rust

> **Executor instructions:** Require an explicit bounded time window and cap
> relation fan-out without silently truncating results. Keep Web, Contacts,
> internal API, and Rust contracts identical.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/users-core/src/lib/user-groups/session-schedule.ts packages/users-core/src/routes/user-groups/sessions packages/internal-api/src/user-group-schedule.ts 'apps/contacts/src/app/api/v1/workspaces/[wsId]/user-groups/sessions' 'apps/contacts/src/app/[locale]/[wsId]/users/groups' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/user-groups/sessions' apps/backend/src/workspaces_wsid_user_groups_sessions.rs apps/backend/src/workspaces_wsid_user_groups_sessions apps/tanstack-web/migration`
> Stop on schedule response, Contacts caller, Rust handler, or route-migration
> drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** performance
- **Depends on:** G22 and backend migration ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The list endpoint can load a workspace's complete session history, expand every
session ID into relation requests, and repeatedly scan vectors while building
the Rust response. Nominal calendar reads can therefore grow with all retained
history and produce oversized PostgREST URLs, memory, and response work.

## Current state

- `session-schedule.ts:96-148` selects every matching row and allows both
  `from` and `to` to be absent before loading all relations.
- Existing indexes already cover `(ws_id, starts_at)` and
  `(ws_id, group_id, starts_at)`; this is a query-contract problem, not a
  missing-index migration.
- `workspaces_wsid_user_groups_sessions.rs:211-238` repeats the unbounded
  contract; its query parser also ignores `includeCancelled`, while
  `fetch_sessions` always forces `status=scheduled`. Its serialization uses
  vector `.find` loops at lines 281-320.
- `includeMissing=true` is fully implemented in TypeScript, but Rust currently
  returns an empty `missing` array; that query shape must fall through to live
  Web until a faithful Rust port exists.
- The Rust file is 692 lines and TypeScript owner is 1,836 lines, so substantial
  edits require focused submodules.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and the backend
`AGENTS.md`. Remain blocked while G22 owns route artifacts or backend migration
paths. Confirm every tracked caller supplies a bounded calendar range before
making the route reject omitted bounds.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Users-core tests | `bun run --cwd packages/users-core test -- src/lib/user-groups/session-schedule-list.test.ts src/routes/user-groups/sessions/route.test.ts` | bounds and row guard pass |
| Internal API tests | `bun run --cwd packages/internal-api test -- src/user-group-schedule.test.ts` | typed query contract passes |
| Web route tests | `bun run --cwd apps/web test -- 'src/app/api/v1/workspaces/[wsId]/user-groups/sessions/route.test.ts'` | first-class bounds/status contract passes |
| Contacts UI tests | `bun --cwd apps/contacts vitest run 'src/app/[locale]/[wsId]/users/groups/_components/user-group-session-calendar.test.tsx'` | all views send valid ranges |
| Rust tests | `cd apps/backend && cargo test --locked workspaces_wsid_user_groups_sessions -- --nocapture` | parity, bounds, query, and mapping pass |
| Backend gate | `bun check:backend` | native and Worker targets plus route coverage pass |
| Typechecks | `bun run --cwd packages/users-core type-check && bun run --cwd packages/internal-api type-check && bun run --cwd apps/contacts type-check` | exit 0 |
| Route tracking | `bun migration:tanstack:manifest && bun migration:tanstack:check` | re-keyed first-class Web contract matches Rust |
| App builds | `bun run --cwd apps/web build && bun run --cwd apps/contacts build` | both route consumers compile |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- split list orchestration under
  `packages/users-core/src/lib/user-groups/session-schedule/` with stable re-export
- shared route validation and focused tests
- typed internal-API query contract and test
- Contacts calendar/schedule callers only where range compliance needs changes
- collision-safe first-class extraction of the Web collection handler and test
- the existing Rust handler, extracted submodules/tests, and matching dispatch behavior
- exact route override re-key and generated manifest
- `plans/README.md` only for status

Do not change session creation/mutation, recurrence generation, attendance,
permissions, or response fields unrelated to bounds metadata.

## Git workflow

Use branch `perf/bound-user-group-sessions` in an isolated worktree and run
`bun setup`. Commit `perf(contacts): bound session listings`. Claim the commit
window before staging; do not push unless instructed.

## Steps

### Step 1: Freeze one exact range contract

Require valid ISO `from` and `to`, `from < to`, and a maximum inclusive span of
400 days. Return 400 with `{ message: 'A valid session range is required' }`
for missing/invalid/reversed/over-wide ranges. Query at most 2,001 ordered rows;
if the sentinel row exists, return 413 with
`{ message: 'Session range contains more than 2000 results; narrow the range' }`
instead of returning a partial list. Apply the same validation before missing-
occurrence work. Parse `includeCancelled` in Rust and omit the scheduled-status
filter exactly when it is true, matching the TypeScript handler. When
`includeMissing=true`, return `None` from Rust before outbound work so the
still-live Web implementation handles recurrence; test that fallthrough rather
than returning a fabricated empty array.

### Step 2: Keep callers and facades explicit

Make `from` and `to` required in `ListWorkspaceUserGroupSessionsParams` and
update every compile-reported caller to send its existing view range. Preserve
the successful `{ data, groups, missing?, tags }` envelope; do not add a cursor
that calendar callers do not need.

### Step 3: Bound and linearize relation projection

Pass no more than 2,000 session IDs to relation queries. In Rust, replace vector
search maps with `HashMap`/`HashSet` projections and use real concurrent joins
supported by the current runtime, or document measured sequential behavior if
parallel polling is unsafe. Split the 692-line Rust handler and 1,836-line
TypeScript owner into focused modules, keeping public imports stable and every
authored file below 700 lines.

### Step 4: Preserve migration parity

Because the Web route behavior changes substantially, collision-safely remove
its generated first-class wrapper, `git mv` the legacy handler and colocated
test into `apps/web/src/app/api/**`, delete the legacy source, and recreate the
wrapper's `HEAD = createLegacyHeadHandler(GET)` export in the moved first-class
handler. Add a HEAD regression test, re-key the exact override, and regenerate
the manifest. Update Rust in the same change and prove identical behavior for
query shapes it owns plus explicit Web fallthrough for `includeMissing=true`.

## Done criteria

- [ ] Missing, invalid, reversed, and over-400-day ranges fail identically in Web and Rust.
- [ ] `includeCancelled=true` includes cancelled rows in both implementations.
- [ ] `includeMissing=true` falls through from Rust and retains the complete Web response.
- [ ] The first-class Web handler preserves generated HEAD behavior.
- [ ] More than 2,000 matching rows fails clearly; no response is silently partial.
- [ ] Relation requests are bounded and Rust association is linear-time.
- [ ] Contacts and internal-API callers compile with explicit ranges.
- [ ] First-class route, Rust parity, focused tests, builds, manifest, backend, and repository gates pass.

## STOP conditions

Stop until migration/backend ownership transfers, if a legitimate caller needs
more than 400 days or 2,000 rows without a product-specific aggregate, if Rust
cannot reproduce the envelope, if the wrapper collision order is unclear, or
if a gate fails twice.

## Maintenance notes

Calendar-shaped reads should be bounded by calendar windows. Add a separate
aggregate/export contract rather than relaxing this interactive endpoint.
