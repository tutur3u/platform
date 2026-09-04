# Plan 233: Bind Calendar Schedule Sources to the Route Workspace

> **Executor instructions:** Reject foreign or missing task/habit sources before
> any schedule write, then make event-plus-junction creation atomic and enforce
> source/event co-tenancy for every database writer.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/schedule' apps/calendar/src/lib/calendar apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plan 154 must restore the full database
  baseline and the Calendar event-policy/database lane must be coordinated
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** security / tenant isolation / graph integrity
- **Depends on:** Plans 154 and 163; Calendar event-policy and database/type
  ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The schedule POST accepts client-authored `previewEvents`, validates only three
display/time fields, and inserts task/habit junctions with the supplied
`source_id`. A user in workspaces A and B can therefore schedule a B source into
an A event. The independent foreign keys and source-only RLS policies permit
that cross-tenant graph, and an ignored junction error can also leave a new
unlinked event while the route reports success.

## Current state and exact contract

- `calendar/schedule/route.ts` casts `body.previewEvents` to `PreviewEvent[]`.
  Preserve absent-body server generation, but treat an explicitly supplied
  empty array as a valid empty desired schedule rather than as “generate”.
- Add a strict request schema matching `PreviewEvent`: nonempty title up to
  `MAX_CALENDAR_EVENT_TITLE_LENGTH`, parseable `start_at`/`end_at` with end after
  start, nonempty bounded `id`, literal `isPreview: true`, nonnegative integer
  `step`, `type` in `habit|task|break`, UUID `source_id` for habit/task,
  `occurrence_date` required and ISO-date-valid for habits, and the existing
  optional color/reuse/nonnegative scheduled-minute fields. Preserve `id`,
  `isPreview`, and `step` through validation for existing preview/debug
  consumers even though persistence does not write those fields. Malformed JSON/body returns
  `400 {error:'Invalid schedule preview',code:'invalid_schedule_preview'}`.
- Before `createEventsFromPreview`, resolve all distinct habit/task IDs set-wise.
  Habits must have `workspace_habits.ws_id = route wsId`. Tasks must resolve
  through list -> board or direct board; every non-null task parent workspace
  must equal route `wsId`, and conflicting direct/list parents are invalid.
  Any missing/foreign source returns
  `400 {error:'One or more schedule sources do not belong to this workspace',code:'invalid_schedule_source'}`
  before encryption, event mutation, or metadata writes.
- Break previews have no junction source and retain current behavior.
- Preserve current successful response fields and encryption semantics. A new
  event and its optional junction either both commit or neither commits.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from the completed Plan 163 isolated-typegen base
only after Plan 154 is green. The canonical Calendar migration note is `done`
and is not an ownership lock; coordinate with retained Plan 086 because both
touch event policies/database tests.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendar/schedule/route.test.ts' src/lib/calendar/schedule-preview-input.test.ts` | schema, absent/empty distinction, source preflight, atomic-create errors, and auth cases pass |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/calendar-schedule-source-binding.sql && bun --cwd apps/database sb:validate:isolated` | both junctions reject foreign parents and atomic RPC/ACL tests pass; full suite green |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/calendar-schedule-source-binding.sql` | generated types include the trusted RPC with no unrelated drift |
| Calendar | `bun run --cwd apps/calendar type-check && bun run --cwd apps/calendar build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** schedule POST route; new focused request/source/persistence modules
and tests; one additive migration; one pgTAP file; generated DB types. Split the
1,078-line route into focused modules so every substantially edited file is
under 700 LOC while keeping the route export stable. **Out of scope:** preview
scoring, scheduling priority, provider sync, UI, task/habit mutation APIs,
orphan cleanup response semantics (Plan 237), production migration apply, and
the broader Plan 108 shared-core extraction.

## Steps

1. Characterize cookie and Calendar app-session authorization, server-generated
   previews, explicit empty previews, valid task/habit/break previews, and the
   current success envelope. Add red cases for malformed fields, foreign/missing
   sources, conflicting task parents, and junction failure after event insert.
2. Extract and test a strict input parser, including required `id`, literal
   `isPreview`, and integer `step` cases. Read the request as text so an empty
   body remains `{}`, malformed nonempty JSON is a 400, absence triggers server
   generation, and an explicit `previewEvents: []` remains explicit.
3. Add an injectable set-based source resolver. It must return one closed result
   for every distinct referenced UUID and reject the entire preview before any
   write if any source is absent, foreign, or ambiguously parented.
4. Create service-role-only
   `private.create_workspace_scheduled_event(p_ws_id uuid, p_title text,
   p_start_at timestamptz, p_end_at timestamptz, p_color text,
   p_is_encrypted boolean, p_source_type text, p_source_id uuid,
   p_occurrence_date date, p_scheduled_minutes integer)` returning the inserted
   event's `id,start_at,end_at`. Validate the source workspace inside the
   transaction, insert the event, insert exactly the matching junction (or none
   for break), and fail as one unit. Revoke the exact signature from PUBLIC,
   `anon`, and `authenticated`; grant only `service_role`.
5. Add a fail-closed migration audit for existing task/habit junctions whose
   source workspace differs from `workspace_calendar_events.ws_id`. Then add
   INSERT/UPDATE constraint triggers on both junction tables that enforce the
   same invariant for every writer, including both list- and direct-board task
   placement. Do not delete or silently repair historical rows.
6. Route new-event creation through the private RPC and inspect every result.
   Keep existing-event matching/update behavior unchanged. Add pgTAP for both
   foreign directions, missing parents, conflicting task parents, direct SQL,
   RPC rollback, service-role ACLs, and valid habit/task/break creation.
7. Run focused/full DB, isolated typegen, Calendar typecheck/build, repository,
   whitespace, source-size, and exact-scope gates.

## Done criteria

- [ ] Every supplied task/habit source is validated against the normalized
      route workspace before any schedule mutation.
- [ ] Event and junction creation is atomic, and PostgreSQL rejects every
      cross-workspace junction writer.
- [ ] Absent previews generate; explicit empty previews remain empty; malformed
      previews fail with the closed 400 contract.
- [ ] All substantially edited source files are below 700 LOC.
- [ ] Focused/full DB, typegen, Calendar typecheck/build, repository, and
      whitespace gates pass.

## STOP conditions

Stop on historical cross-tenant rows, red Plan 154 baseline, unresolved
Calendar/database ownership, a supported source type outside habit/task/break,
need to change preview scoring or existing-event update semantics, inability to
derive one task workspace, production apply need, or any mandatory gate failing
twice.
