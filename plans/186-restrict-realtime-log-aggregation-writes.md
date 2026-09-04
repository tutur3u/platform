# Plan 186: Restrict Realtime Log-Aggregation Writes

> **Executor instructions:** Retire the unauthenticated development-only
> browser-to-admin writer, then leave a bounded service-only aggregation RPC
> without changing dashboard reads.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts packages/supabase/src/next/realtime-log-aggregator.ts packages/supabase/src/next/realtime-log-actions.ts packages/supabase/src/next/realtime-log-provider.tsx packages/supabase/src/next/__tests__/realtime-log-aggregator.test.ts packages/supabase/src/next/__tests__/realtime-log-actions.test.ts packages/supabase/src/next/__tests__/realtime-log-provider.test.tsx apps/infrastructure/src/app/api/v1/workspaces apps/backend/src/workspaces_infrastructure_realtime_analytics.rs apps/backend/src/workspaces_infrastructure_realtime_analytics_summary.rs tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / observability / database
- **Depends on:** Plan 154 (BLOCKED); database and Infrastructure/backend contract review
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The definer RPC accepts an arbitrary JSON array and is executable by anonymous
and authenticated clients. A public caller can forge workspace/user/channel
counts and sample messages or force an unbounded row-by-row loop, corrupting
operational dashboards and consuming database work.

## Current state

- `20251120120000_create_upsert_realtime_log_aggregations_rpc.sql:3-43`
  trusts every JSON field, loops the complete array, lacks a fixed search path,
  and grants execute to `authenticated, anon`.
- The only repository caller is
  `packages/supabase/src/next/realtime-log-aggregator.ts:263-279`, which creates
  an admin client before invoking the RPC.
- The browser provider invokes the exported `addRealtimeLog` server action in
  development. That action currently accepts caller-selected workspace/user,
  kind, message, and data without authenticating the actor, so service-only RPC
  ACLs alone would leave an indirect privileged writer.
- The same `'use server'` module exports unauthenticated `flushRealtimeLogs()`,
  allowing a caller to force privileged database work. Repository search finds
  no caller of either action outside the provider and their focused tests.
- `RealtimeLogProvider` is mounted by Web and many registered satellites, while
  the shared package cannot resolve every host's app-session actor without an
  app identity or a dependency cycle. The persistence call runs only behind a
  browser `NODE_ENV === 'development'` branch and has no production caller, so
  this plan retires that remote dev path rather than inventing shared auth.
- Infrastructure and prepared Rust handlers only read the aggregate table;
  their response behavior is read-only evidence.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database,
Infrastructure, and backend AGENTS. Confirm no external writer and derive a
batch limit from the retired aggregator's existing constants. Stop if registry
or supported external-consumer evidence establishes that remote development-log
persistence is a public contract.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/realtime-log-aggregation-privileges.sql` | ACL/input/batch matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Supabase tests | `bun --cwd packages/supabase vitest run src/next/__tests__/realtime-log-provider.test.tsx` | provider/context and console-only logger contract passes |
| Supabase types | `bun run --cwd packages/supabase type-check` | exit 0 |
| Supabase build | `bun run --cwd packages/supabase build` | package exports compile without deleted internals |
| Retired writer | `test ! -e packages/supabase/src/next/realtime-log-actions.ts && test ! -e packages/supabase/src/next/realtime-log-aggregator.ts` | no client-addressable privileged writer remains |
| Backend | `bun check:backend` | read-only analytics parity passes |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive function/ACL migration;
`realtime-log-aggregation-privileges.sql`; deletion of the unexported aggregator,
the client-addressable action module, and their tests; a console-only provider
plus focused provider test; generated types read-only.

**Out of scope:** dashboard query aggregation/pagination; log retention;
changing read responses; removing browser console diagnostics or provider/context
exports; designing a cross-app observability ingest service; production apply.

## Git workflow

Use `fix/restrict-realtime-log-writes` and commit
`fix(infrastructure): restrict realtime log writes`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Inventory repository and registry-supported consumers. Confirm the action
   and aggregator have no supported caller other than the provider's
   development-only persistence branch, and record the existing 1,000-entry and
   ten-sample constants as the server-side validation basis.
2. Remove the provider's `addRealtimeLog` invocation while preserving its public
   component, context hook, logger signature, development console output, and
   production silence. Delete `realtime-log-actions.ts` (including both
   `addRealtimeLog` and `flushRealtimeLogs`), the now-unreachable aggregator,
   and their focused tests. Add a provider test proving no persistence action is
   imported/invoked and the existing console/context contract remains stable.
3. Replace the function with fixed `search_path`, explicit JSON-array/type
   validation, a maximum of 1,000 rows per call, `total_count` from 1 through
   1,000, `error_count` from 0 through `total_count`, at most ten bounded sample
   strings of at most 2,000 characters each, and the existing required
   identifier/time fields. Preserve additive conflict semantics and signature.
4. Revoke execute from `PUBLIC`, `anon`, and `authenticated`; explicitly grant
   service role only. There is no application caller after Step 2; this narrow
   grant preserves a controlled maintenance/recovery seam without public access.
5. Add pgTAP tests for public denial, service success, malformed/non-array
   input, oversized batch/sample, negative/overflowing counters, cross-workspace
   fixture isolation, and additive upsert behavior.
6. Run focused/full DB, provider/package, backend, repository, and whitespace
   gates.

## Done criteria

- [ ] No browser/server action can reach service-role aggregation or force a
      flush; the provider remains API-compatible and console-only.
- [ ] One call cannot exceed 1,000 aggregate rows, ten samples per row, or the
      documented counter bounds.
- [ ] Existing additive aggregation and read APIs remain unchanged.
- [ ] Focused/full DB, package, backend, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, a supported external persistence consumer, another
runtime writer, no defensible bound from the retired constants, provider/context
API drift, signature/type drift, changed analytics responses, red Plan 154, or
a gate failing twice.
