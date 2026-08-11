# Plan 282: Single-Source Web and Track Time-Tracking Routes

> **Executor instructions:** First restore the five divergent Web routes to the
> stricter Track behavior, then extract all 25 overlapping handlers behind one
> server-only route core with explicit host-auth adapters. Leave Web as a thin
> first-class compatibility host and add a no-drift inventory gate.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/time-tracking' 'apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking' 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking' apps/track/src/lib/time-tracking apps/web/src/lib/api-auth.ts apps/track/src/lib/api-auth.ts packages/time-tracking-core apps/web/package.json apps/track/package.json bun.lock apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json scripts/time-tracking-route-authority.test.js tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — G22 owns Web route-manifest artifacts and
  Mail owns `bun.lock`; obtain exact transfers before extraction
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** architecture / authorization / migration authority
- **Depends on:** completed Plans 044/055/113 behavior; G22 route-artifact and
  Mail lockfile transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Web and Track both execute 25 time-tracking handlers. Twenty copies are
byte-identical, while five have already diverged. Web still allows cross-user
goal/session reads that Track restricts, and its comment mutation lacks Track's
parent-request workspace proof. A fix marked DONE can therefore protect only
one live host while the other remains executable.

## Current state and exact contract

- The common relative route inventory contains exactly 25 `route.ts` files.
  The only divergent files are `goals/route.ts`, `goals/[goalId]/route.ts`,
  `sessions/route.ts`, `requests/[id]/route.ts`, and
  `requests/[id]/comments/[commentId]/route.ts`. Recompute and STOP on drift.
- Before extraction, Web must match Track's settled Plans 044/055/113 behavior:
  cross-user goals/sessions require `manage_time_tracking_requests`; request
  image preservation remains lossless; comment update/delete proves both the
  comment/request pair and the parent request's normalized route workspace.
- Create private package `@tuturuuu/time-tracking-core` with exports for the 25
  route factories plus shared `resolveTimeTrackingReadUser`. It receives one
  `TimeTrackingRouteAdapter` containing exactly:
  `resolveSessionAuthContext(request, rawWsId)`,
  `withSessionAuth(handler)`, and `normalizeWorkspaceId(rawWsId, request)`.
  The returned auth context must expose the existing `user`, canonical `wsId`,
  and Supabase clients used by current handlers. Product queries, schemas,
  response envelopes, permissions, and status codes live only in the core.
- Web adapter preserves its existing cookie plus supported app-session/Bearer
  behavior; Track adapter uses its registered `track` session boundary. No core
  function may resolve an actor implicitly or import an app `@/` alias.
- Replace the generated Web destinations deliberately: move each legacy route
  and colocated test first-class (remove the generated wrapper), then reduce
  both Web and Track route files to adapter-bound exports. The audited snapshot
  has no explicit override entry for these 25 routes, so leave
  `route-overrides.json` unchanged unless drift introduces one; regenerate the
  manifest so its 25 source IDs point at the new first-class paths. Plain
  `git mv` onto an existing wrapper is forbidden: inspect wrapper exports,
  remove it, move the implementation/test, then run the wrapper check.
- Add a script test that inventories the 25 relative routes, verifies both
  hosts import only the shared factories/host adapters, and forbids product
  logic or a second implementation under Web legacy routes.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Inventory | `diff -u <(find 'apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking' -name route.ts -print | sed 's#apps/web/src/app/api/v1/workspaces/\[wsId\]/time-tracking/##' | sort) <(find 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking' -name route.ts -print | sed 's#apps/track/src/app/api/v1/workspaces/\[wsId\]/time-tracking/##' | sort)` | no diff; exactly 25 route paths |
| Focused parity | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking' && bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking'` | cross-user, image, comment, and existing route tests pass in both hosts |
| Core | `bun --cwd packages/time-tracking-core test && bun --cwd packages/time-tracking-core type-check` | shared contract matrix passes |
| Authority guard | `node --test scripts/time-tracking-route-authority.test.js` | exact 25-path inventory and thin-adapter source contract pass |
| Route guards | `bun web:api-routes:check && bun migration:tanstack:manifest && bun migration:tanstack:check` | no legacy wrappers regenerate; regenerated manifest is internally fresh and its intended source-ID diff remains scoped |
| Apps | `bun run --cwd apps/web type-check && bun run --cwd apps/track type-check && bun run --cwd apps/web build && bun run --cwd apps/track build` | both hosts compile/build |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** the exact 25 overlapping route paths in both hosts; existing
time-tracking route tests; new private core package and adapter contract; Web
first-class route replacement; package dependencies via Bun; lockfile; the 25
  manifest entries (and only a drift-introduced matching override); one source-
  inventory script test at `scripts/time-tracking-route-authority.test.js`.

**Out of scope:** Track pages/components, non-overlapping time-tracking routes,
database/RPC semantics, new Rust handlers, URL/envelope changes, retiring Web
compatibility, proxy redirects, or changing which callers use which host.

## Steps

1. Freeze the 25-path inventory and five-diff list. Add cross-host red tests for
   every divergent authorization/workspace/image behavior before movement.
2. Bring Web to the stricter settled Track behavior without weakening Track.
   If a supported caller requires the insecure behavior, STOP for a versioned
   compatibility decision.
3. Scaffold the private core package and exact adapter above using Bun for both
   host dependencies. Move cohesive route families in bounded batches while
   keeping files under 700 LOC and preserving export signatures.
4. For each Web route, inspect/delete its generated wrapper, `git mv` the legacy
   implementation and colocated test when present, replace implementation with
   a thin adapter export, regenerate the manifest source ID, and run the wrapper
   and manifest checks before the next family. Do not invent override entries.
5. Convert Track routes to the same factories. Add a matrix covering cookie,
   registered Track app session, supported Bearer auth, personal/UUID workspace,
   permission denial, cross-user reads, and parent workspace containment.
6. Add the no-drift inventory/AST-source contract, run every focused/core/app/
   build/migration/repository gate, and review exact scope.

## Done criteria

- [ ] Exactly 25 Web/Track route pairs remain, with no duplicated product logic.
- [ ] The five formerly divergent routes enforce the stricter Track contracts
      on both hosts.
- [ ] Host actor resolution remains explicit and app-session-safe.
- [ ] Web implementations are first-class; wrappers/override IDs/manifest are
      fresh and no legacy time-tracking implementation remains.
- [ ] Focused/core/app/build/migration/repository gates pass.

## STOP conditions

Stop if ownership/lockfile transfer is missing; the route inventory differs from
25 or the divergent set changes; a caller needs weaker authorization; adapter
auth cannot preserve both hosts; the extraction requires a database/Rust/API
contract change; a Web wrapper cannot be safely replaced; another lane edits
these routes; or a mandatory gate fails twice.

## Maintenance notes

Host adapters may differ only in authentication/session plumbing. Permission,
tenant, mutation, and response logic belongs to one core so a future fix cannot
land on only one executable authority.
