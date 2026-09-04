# Plan 210: Aggregate Push Dashboard Metrics in One Bounded Query

> **Executor instructions:** Preserve the Infrastructure push-dashboard JSON
> contract while replacing both duplicated dashboard loaders with one trusted,
> bounded database response and making failures observable instead of rendering
> zeros.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- apps/infrastructure/src/app/api/v1/infrastructure/push-notifications/route.ts apps/infrastructure/src/app/api/v1/infrastructure/push-notifications/route.test.ts 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/push-notifications/page.tsx' 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/push-notifications/page.test.tsx' apps/infrastructure/src/lib/notifications/push-dashboard-data.ts apps/infrastructure/src/lib/notifications/push-dashboard-data.test.ts packages/internal-api/src/infrastructure/native-settings.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** performance / correctness / database
- **Depends on:** Plans 154 and 163; database/generated-type ownership transfer
- **Planned at:** commit `52f4aa1b12`, 2026-08-10

## Why this matters

Both the native-settings API and the rendered Infrastructure page independently
launch eighteen exact-count PostgREST requests plus recent-row reads; the page
also performs two identity-enrichment queries. Every failed count is converted
to zero, so database failure is indistinguishable from real zero device or
delivery coverage. One bounded service-role response shared by both callers can
preserve their outputs while reducing each load to one database operation.

## Current state and exact contract

- `apps/infrastructure/src/app/api/v1/infrastructure/push-notifications/route.ts:94-196`
  counts total, active-24h, active-7d, three flavors, two platforms, every
  flavor/platform pair, and four push batch statuses through eighteen separate
  head requests. It separately loads at most 20 devices and 12 batches.
- `apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/push-notifications/page.tsx:93-284`
  duplicates the counts/recent lists and then loads user display/private detail
  rows for recent devices. Its `countRows` has the same false-zero behavior.
- `countRows` logs and returns `0` on any count error. Remove that false-zero
  fallback for dashboard metrics.
- Add one service-role-only, fixed-search-path RPC returning exactly the current
  scalar metric groups plus at most 20 recent devices and 12 recent push
  batches. Accept the two server-derived active thresholds as timestamptz
  arguments and validate their ordering in SQL. Recent devices include the
  current masked token preview and joined display-name/full-name/email fallback
  fields, never the raw token; recent batches keep the current projection.
- Extract one server-only typed loader at
  `apps/infrastructure/src/lib/notifications/push-dashboard-data.ts` that calls
  and validates this RPC. Both the API route and page must use it; neither may
  retain a direct count/list/identity query. The successful route JSON,
  rendered page semantics, and `packages/internal-api` type remain unchanged.
- If the aggregate RPC fails or returns a malformed payload, the API returns a
  sanitized `500` and the page throws into its existing Next error boundary; do
  not emit or render successful zero data.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read Infrastructure/database AGENTS files. Execute from the
green Plan 154 plus completed Plan 163 base in an isolated worktree after
database/type ownership transfer; run `bun setup` immediately.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun --cwd apps/infrastructure vitest run src/lib/notifications/push-dashboard-data.test.ts src/app/api/v1/infrastructure/push-notifications/route.test.ts 'src/app/[locale]/(dashboard)/[wsId]/push-notifications/page.test.tsx' src/app/api/v1/infrastructure/push-notifications/test/route.test.ts` | both callers use one RPC; auth, mapping, rendering, bounds, and failure cases pass |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/push-notification-dashboard-metrics.sql` | aggregate, thresholds, empty state, ACL, and status counts pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Type generation | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/push-notification-dashboard-metrics.sql` | generated RPC signature passes |
| Infrastructure types/build | `bun run --cwd apps/infrastructure type-check && bun run --cwd apps/infrastructure build` | exit 0 |
| Internal API | `bun run --cwd packages/internal-api type-check` | unchanged response type compiles |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive aggregate RPC migration; focused pgTAP; new shared
server loader/test; push-dashboard API route/new colocated test; rendered page/
new colocated test; generated DB types; internal-api type only if needed to
preserve the exact response. **Out of scope:** notification sending/test
endpoint behavior, UI redesign, Firebase configuration, device registration,
batch lifecycle transitions, new polling, Rust/Web routes, production apply,
or generic dashboard aggregation.

## Steps

1. Add API and page characterization tests for the current successful JSON/
   rendering, auth boundary, identity fallback, recent-list limits, and each
   duplicated fan-out. Add red cases proving a data failure must not become
   successful/rendered zero data.
2. Create the aggregate RPC with conditional counts, bounded recent-device
   identity projection, and bounded recent push batches; fixed search path;
   exact function-level revokes from `PUBLIC`, `anon`, and `authenticated`; and
   grant only to `service_role`. Add pgTAP for empty/mixed states, thresholds,
   limits/order, token masking, identity fallback, push-only batch filtering,
   ACLs, and invalid threshold ordering.
3. Add the strict shared loader, then replace both copies of `countRows` and all
   direct dashboard queries with it. Map the API response byte-for-byte and the
   page view model equivalently. Fail the API/page honestly on any RPC or shape
   error.
4. Run route/focused/full DB validation, typegen, Infrastructure/internal-api
   typechecks, production build, repository, whitespace, and final scope gates.

## Done criteria

- [ ] Each API or page dashboard load performs one bounded aggregate RPC and no
  direct count/list/identity query.
- [ ] All current counts and successful response fields retain their semantics.
- [ ] Database/list failures are observable and never rendered as false zero.
- [ ] The aggregate is fixed-search-path and service-role-only.
- [ ] Focused/full DB, typegen, Infrastructure/internal-api, build, repository,
  and whitespace gates pass.

## STOP conditions

Stop on response-semantic drift, an unclassified batch status that changes the
four documented counts, inability to express the aggregate without scanning
unbounded result rows into the app, red Plan 154 baseline, default-stack
mutation, ownership conflict, unexpected generated-type drift, or any mandatory
gate failing twice.
