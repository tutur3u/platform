# Plan 290: Aggregate AI Studio Run-Step Counts Inside the Bounded Page

> **Executor instructions:** Preserve the current run-list cursor and response,
> but compute step/tool counts set-wise for only its bounded page. Do not fetch
> raw step rows or silently turn aggregation failure into zero counts.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/ai/src/app/api/v1/workspaces/[wsId]/ai/runs/route.ts' 'apps/ai/src/app/api/v1/workspaces/[wsId]/ai/runs/route.test.ts' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts packages/ai/src/studio tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — adjacent AI Studio migration/source ownership
  and the database/generated-type lane have not transferred
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / correctness / test coverage
- **Depends on:** Plans 154 and 163; AI Studio and database/type ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

A run page is bounded to 100 rows, but the route separately materializes every
matching step and counts them in TypeScript. More than the PostgREST row ceiling
silently truncates that second query, producing plausible but false
`stepCount`/`toolCallCount` values. The existing test omits the step-query seam,
and the route catches that failure as zeros, so the canonical suite cannot see
the defect.

## Current state and exact contract

- `apps/ai/src/app/api/v1/workspaces/[wsId]/ai/runs/route.ts` requests at most
  101 consumption events, slices the public page to at most 100, then
  `loadStepCounts()` selects raw `run_id, kind` rows from
  `private.ai_studio_run_steps`. It warns/returns an empty map on query error and
  catches missing test-client methods, converting unavailable data to zero.
- `private.ai_studio_run_steps` has unique `(run_id, sequence)` but no per-run
  ceiling. `private.list_ai_studio_consumption_events` is currently the bounded,
  service-role-only page authority and returns sanitized run/ledger events.
- Keep `private.list_ai_studio_consumption_events` and every existing consumer
  unchanged. Add
  `private.get_ai_studio_run_step_counts(p_ws_id uuid, p_run_ids uuid[])
  returns table(run_id uuid, step_count bigint, tool_call_count bigint)`.
  Reject null workspace/input, null IDs, and cardinality outside 1..100 with a
  named P0001 error. Deduplicate the UUID array before work, join only
  `private.ai_studio_runs` whose `ws_id = p_ws_id`, and group their steps in one
  query. A tool call is exactly `kind = 'tool'`; `step_count` includes every
  step kind. Omit foreign/unknown IDs. The route initializes every bounded page
  event to zero, then overlays returned counts, so unmatched credit-ledger
  events and real zero-step runs remain zero without exposing foreign existence.
  When the public page is empty, skip the aggregate RPC entirely and preserve
  the current 200 `{ runs: [], nextCursor: null }` response and cache header;
  never call the 1..100 RPC with an empty array.
- Preserve all existing tenant/user/date/status/feature/model/external-app/
  execution-mode filters, `(created_at,event_id)` cursor order, 101 internal cap,
  public `limit <= 100`, response keys, cache header, and sensitive-content
  exclusions. Convert bigint counts to safe JavaScript numbers after asserting
  they are nonnegative safe integers.
- Delete `loadStepCounts` and its raw-table fallback. RPC failure remains the
  existing sanitized `{ error: 'Runs unavailable' }`, status 500; malformed or
  unsafe aggregate values must also fail closed with that envelope, not zeros.
- Give the new function a fixed `pg_catalog` search path. Revoke the exact
  `(uuid, uuid[])` signature from PUBLIC, anon, and authenticated and grant only
  service_role. No browser role receives private step access.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from the completed Plan 163 validator base only
after Plan 154 is green. Obtain exact migration/source review from the active AI
Studio lane and database/generated-type owners. Do not reproduce credential
values from coordination notes.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/ai vitest run 'src/app/api/v1/workspaces/[wsId]/ai/runs/route.test.ts'` | exact mixed/zero/error/unsafe count cases pass |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/ai-studio-run-step-counts.test.sql --typegen packages/types/src/supabase.ts` | >1,000-step, bounded-page, tenant, filter, cursor, and ACL cases pass |
| Full database | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts` | full isolated reset/pgTAP and typegen pass |
| Deterministic types | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot"` | second type generation matches the intentional generated diff |
| AI app | `bun run --cwd apps/ai type-check && bun run --cwd apps/ai build` | AI app compiles and builds |
| Repository | `bun check && git diff --check` | repository and whitespace gates pass |

## Scope

**In scope:** the run-list route and focused test; one additive migration that
adds the exact bounded aggregate RPC; one focused pgTAP file; generated Supabase
types.

**Out of scope:** run detail/content retention; step creation; metering/pricing;
page filters/cursor redesign; public browser access to private tables; AI Studio
UI redesign; provider behavior; any credential rotation or deployment work.

## Steps

1. Expand the route fixture so its admin client exposes the real RPC seam. Add
   red assertions for mixed kinds, zero-step events, aggregation RPC error, and
   unsafe count values. Add an empty-page case proving the 200 empty envelope
   and that the aggregate RPC is not called. Prove the current swallowed
   fallback fails the non-empty count tests.
2. Add the exact `(uuid, uuid[])` aggregate RPC in one additive migration.
   Validate the 1..100 UUID input, deduplicate it, workspace-bind through
   `ai_studio_runs`, aggregate steps once, and apply the exact signature ACL and
   comment contract.
3. Add pgTAP with 100 page runs and more than 1,000 combined steps, one
   zero-step run, mixed kinds, another workspace/user, equal-time cursor ties,
   and every supported filter. Assert exact counts and service-role-only access.
4. Remove the raw step query and fallback from the route. Map the RPC count
   fields directly after safe-integer validation while retaining all current
   response and privacy fields.
5. Run focused/full DB, deterministic typegen, route, AI typecheck/build,
   repository, whitespace, and exact-scope gates.

## Done criteria

- [ ] The run-list route performs no raw `ai_studio_run_steps` select.
- [ ] Step/tool counts are exact above 1,000 combined rows and for zero-step events.
- [ ] Empty pages preserve the current 200 envelope and never invoke the aggregate RPC.
- [ ] The aggregate receives only the at-most-100 public page IDs and does not scale with off-page history.
- [ ] Aggregation or unsafe-value failures return sanitized 500, never false zeros.
- [ ] All current filters, cursor ordering, response/privacy fields, cache headers, and ACLs remain exact.
- [ ] Focused/full DB, deterministic types, route, build, repository, whitespace, and scope gates pass.

## STOP conditions

Stop on drift in the AI Studio page RPC or its active owner; a supported direct
caller of the new aggregate beyond service_role; an event identity that cannot
be related safely to a workspace run; the route sending more than 100 IDs; a
query plan that scans off-page run steps rather than the supplied UUID set;
database/type ownership conflict; a red exact-base isolated baseline; or any
mandatory gate failing twice.

## Maintenance notes

Keep summary inputs tied to the bounded page. Returning one RPC row per event
does not itself prove bounded work; reviewers should verify the supplied UUID
set and workspace join constrain the step scan before aggregation.
