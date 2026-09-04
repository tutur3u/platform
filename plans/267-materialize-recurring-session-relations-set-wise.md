# Plan 267: Materialize Recurring Session Relations Set-Wise

> **Executor instructions:** Replace per-occurrence relation synchronization
> with one workspace-bound transactional RPC that resolves tags once and writes
> all materialized-series tag/file links set-wise.

> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/users-core/src/lib/user-groups/session-schedule.ts packages/users-core/src/lib/user-groups/session-schedule-data.ts packages/users-core/src/lib/user-groups/session-schedule*.test.ts 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/user-groups/sessions/route.test.ts' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** performance / recurring-session persistence
- **Depends on:** Plans 154/163; database/generated-type and adjacent user-group ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

A recurring series can materialize roughly 365 daily occurrences. Creation,
conversion, and future-series update then launch one unbounded relation-sync
promise per row. Each promise re-resolves identical tag names and performs up to
four tag/file delete/insert statements. One request can therefore launch
hundreds of concurrent multi-statement workflows, contend on tag uniqueness,
and leave mixed relations when one occurrence fails.

## Exact set-wise contract

Add a private service-role RPC:

`private.sync_workspace_user_group_session_series_relations(
p_ws_id uuid, p_series_id uuid, p_tag_ids uuid[] default null,
p_tag_names text[] default null, p_files jsonb default null) returns integer`.

`NULL` means preserve that relation family; an empty array means clear it. The
RPC must advisory-lock `(p_ws_id,p_series_id)`, verify the series and every
selected tag belong to `p_ws_id`, normalize/deduplicate tag names and file paths,
resolve/create each tag once under the workspace/name uniqueness contract, lock
the current occurrence IDs, replace only requested relation families set-wise,
and return the number of affected occurrences. Any invalid tag/file or write
failure rolls back the whole relation replacement. Revoke the exact signature
from `PUBLIC`, `anon`, and `authenticated`; grant only `service_role`.
Concurrent tag creation must use the existing functional unique index explicitly:
`ON CONFLICT (ws_id, lower(name)) DO UPDATE SET name = excluded.name RETURNING
id`; do not use a read-then-insert race.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Execute from completed
Plan 163 only after Plan 154 is green and database/type paths transfer. Confirm
all series materialization callers and preserve single-detached-session behavior.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused service | `bun --cwd packages/users-core vitest run src/lib/user-groups/session-schedule.test.ts src/lib/user-groups/session-schedule-data.test.ts` | create/convert/future-series semantics and one-RPC call counts pass |
| Route characterization | `bun --cwd apps/web vitest run 'src/legacy-api-routes/v1/workspaces/[wsId]/user-groups/sessions/route.test.ts'` | public response/error contract passes |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/user-group-session-series-relations.sql` | max-horizon, rollback, concurrency, ACL, and relation assertions pass |
| Full database/typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts` | full pgTAP passes and generated types change only for the RPC |
| Packages/apps | `bun run --cwd packages/users-core type-check && bun type-check:web && bun --cwd apps/web run build` | package, Web types, and real build pass |
| Repository | `bun check && git diff --check` | all checks and whitespace pass |

## Scope

In scope: the three series relation fan-out sites; one additive private RPC and
pgTAP file; generated types; focused service/route tests; extracting focused
helpers if either edited source would exceed the repository size ceiling.

Out of scope: recurrence date semantics, the twelve-month horizon, single
session relation writes, response pagination, attendance, reminders, Calendar
provider sync, UI redesign, or production migration application.

## Steps

1. Add red service tests for maximum-horizon creation, existing-series
   conversion, future split, empty-versus-omitted relation inputs, and an
   injected mid-series failure. Assert one relation RPC, not N promises.
2. Add the signature-stable RPC with workspace/series locking, conflict-safe
   set-wise tag/file resolution, exact `NULL`/empty semantics, and service-role
   ACLs. Keep the existing materialization RPC/date contract unchanged.
3. Replace the three `Promise.all(rows.map(syncSessionRelations))` paths with
   one awaited series RPC after materialization. Keep the detached/single
   session helper for its supported callers.
4. Add pgTAP for 365-ish occurrences, tag creation once, stable relation counts,
   concurrent identical calls, foreign tag rejection, unknown JSON key and
   blank file-path rejection, stable duplicate-path deduplication, rollback,
   clears, preserves, and function privileges. File rows have no external owner
   entity, so do not invent a path-prefix or cross-workspace lookup contract.
5. Run focused service/route, focused/full isolated database/typegen, typecheck,
   build, repository, whitespace, source-size, and exact-scope gates.

## Done criteria

- [ ] Each materialized series uses one transactional relation RPC regardless of occurrence count.
- [ ] Tag names resolve once and every occurrence ends with identical requested relations.
- [ ] Invalid or failed writes leave every occurrence's prior relation graph intact.
- [ ] Recurrence dates, public responses, and single-session behavior remain unchanged.
- [ ] Focused, pgTAP, full isolated, build, repository, and scope gates pass.

## STOP conditions

Stop if a supported caller needs per-occurrence relation divergence; tag/file
identity cannot be represented by the closed RPC contract; existing invalid or
duplicate tag/file state prevents deterministic replacement; Plan 154 is not
green; ownership is unavailable; generated type drift exceeds the RPC; or any
mandatory gate fails twice.
