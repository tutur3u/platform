# Plan 245: Cursor-Page Rich-Text Task Notes Across TypeScript and Rust

> **Executor instructions:** Replace the unbounded task-note list with one
> bounded, stable keyset-page contract. Keep the live Tasks route, live Web
> compatibility route, prepared Rust handler, typed client, and Tasks UI
> behavior in lockstep. Run every verification command and stop on any
> condition listed below; do not improvise.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/notes' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/notes' 'apps/web/src/app/api/v1/workspaces/[wsId]/notes' apps/backend/src/workspaces_wsid_notes.rs apps/backend/api/openapi.yaml packages/internal-api/src/index.ts packages/internal-api/src/task-notes.ts packages/internal-api/src/task-notes.test.ts packages/tasks-ui/src/tu-do/notes/note-list.tsx packages/tasks-ui/src/tu-do/notes/note-list.test.tsx apps/database/supabase/migrations apps/database/supabase/tests apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plans 154/163 must provide the green isolated
  database/typegen base, and the active
  `codex/g22-time-roles-templates` coordination note is `working` and reserves
  coordinator control of `apps/backend/api/openapi.yaml` and
  `apps/tanstack-web/migration/route-manifest.json`; obtain an exact-path
  transfer before execution. The active `Codex` Tasks note is also `working`
  and owns `apps/tasks/src/app/[locale]/(dashboard)/[wsId]/**`, but not the
  notes API or `packages/tasks-ui`; coordinate its adjacent dashboard validation
  before changing the shared Notes experience.
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** performance / correctness / API migration / tests
- **Depends on:** Plans 154 and 163 plus exact artifact transfer from the active
  G22 coordinator; no existing implementation plan duplicates this work
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Every Notes screen currently asks PostgREST for every matching row, including
each complete TipTap JSON document. The local Supabase contract caps table/RPC
responses at 1,000 rows, so sufficiently large histories both grow the payload
without bound and then silently become incomplete while the UI still presents
the response as the whole list. The prepared Rust handler repeats the same
query and response shape. A closed cursor-page contract bounds database,
network, JSON parsing, and rendering work while making continuation explicit.

## Current state and dedupe evidence

- `apps/tasks/src/app/api/v1/workspaces/[wsId]/notes/route.ts:21-40` is the
  Tasks satellite GET. It filters `ws_id`, `creator_id`, and `archived`, orders
  only by `created_at DESC`, selects `*`, applies no limit, and returns a raw
  array. Its POST and app-session authorization must remain behaviorally
  unchanged.
- `apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/notes/route.ts:65-90`
  is the still-live Web compatibility implementation with the same unbounded
  GET. Its generated first-class wrapper is
  `apps/web/src/app/api/v1/workspaces/[wsId]/notes/route.ts`. Because this GET
  is being substantially reworked, move the implementation and its new test
  first-class; preserve POST exactly and retain the generated wrapper's HEAD
  behavior through an explicit first-class HEAD export.
- `apps/backend/src/workspaces_wsid_notes.rs:154-199` is the prepared GET-only
  Rust handler. It sends `select=*` and `order=created_at.desc`, parses the
  complete response, and returns a raw array. Non-GET methods deliberately
  return `None`; POST must continue falling through to Web.
- `packages/tasks-ui/src/tu-do/notes/note-list.tsx:48-55,116-157` defines a
  local, narrower-than-database `Note`, calls the API directly with
  `useQuery<Note[]>`, parses every rich-text body, and treats the array as
  complete. Lines 448-455 display the loaded array length as the apparent
  total, and lines 480-572 render a full read-only TipTap editor for every
  returned card.
- `apps/database/supabase/config.toml:14-16` fixes PostgREST `max_rows = 1000`.
  `apps/database/supabase/migrations/20250929042000_add_notes.sql:101-104` has
  only single-column indexes on `ws_id`, `creator_id`, and `created_at`; none
  matches the filter plus stable sort.
- `apps/tanstack-web/migration/route-manifest.json:3793-3798` records the Web
  list source as legacy. No matching notes entry exists in
  `apps/tanstack-web/migration/route-overrides.json` at the planned snapshot.
- `apps/backend/api/openapi.yaml` has no notes path at the planned snapshot,
  even though Rust dispatches the GET. Add the prepared contract without
  claiming that Rust serves production traffic.
- This finding is absent from Plans 001-242 and the complete deferred/rejected
  ledger. It is distinct from Plan 153 (analytics datasets), Plan 165 (report
  snapshots), Plan 209 (workspace members), and Plan 227 (external chat
  threads). There is no exact active owner for either note list route, the Rust
  handler, the task-note typed client/UI, or a notes index migration. Artifact
  ownership is the only hard execution block described in Status.

## Exact public and storage contract

- Keep `GET /api/v1/workspaces/:wsId/notes` and the existing `archived=1|true`
  meaning. Add `limit` with default `24`, minimum `1`, and maximum `100`, plus
  optional opaque `cursor`. Missing `archived` remains active-note behavior.
- A malformed, undecodable, wrong-version, partially shaped cursor or an
  integer `limit` outside `1..100` returns `400 { "error": "Invalid notes pagination" }`.
  Authentication/membership/data-source statuses and sanitized error bodies
  otherwise remain unchanged.
- Return exactly `{ notes: TaskNote[], nextCursor: string | null }`. `TaskNote`
  is the database row contract for `public.notes`: `id`, `content`, `ws_id`,
  `creator_id`, `created_at`, `updated_at`, `archived`, `deleted`, and `title`,
  with the nullability generated in `Database['public']['Tables']['notes']['Row']`.
  Do not retain a raw-array compatibility branch.
- Order by `(created_at DESC NULLS LAST, id DESC)`. The cursor is base64url,
  unpadded UTF-8 JSON with the strict closed shape
  `{ "v": 1, "t": <ISO timestamp or null>, "i": <UUID> }`. Callers treat it
  as opaque. Web/Tasks validate UUID and timestamp syntax with a strict schema;
  Rust validates the identical fields. A non-null cursor includes rows where
  `created_at < t`, rows tied at `t` with `id < i`, and legacy null-timestamp
  rows. A null-timestamp cursor includes only null-timestamp rows with `id < i`.
- Query `limit + 1`, return at most `limit`, and create `nextCursor` from the
  last returned row only when the extra row exists. Apply `ws_id`,
  `creator_id`, and `archived` before the cursor. Never auto-drain pages on the
  server or client.
- Add one index exactly matching the page boundary:
  `public.notes (ws_id, creator_id, archived, created_at DESC NULLS LAST, id DESC)`.
  Use `bun sb:new cursor_page_task_notes`; do not edit the historical migration
  or apply production changes.
- Put shared TypeScript types plus cursor encode/decode/query construction in
  `packages/internal-api/src/task-notes.ts`, exported from `src/index.ts`.
  `listWorkspaceTaskNotes(wsId, { archived, cursor, limit }, options?)` uses
  `getInternalApiClient`, path-segment encoding, `cache: 'no-store'`, and the
  exact response envelope. Server route code may reuse pure cursor validation
  from this package; it must not depend on UI code.
- Convert `NoteList` to `useInfiniteQuery` with page param `nextCursor`, flatten
  pages in order, and render only loaded pages. Keep full rich content in each
  bounded page so edit/conversion behavior remains unchanged. Replace the
  misleading total badge with a loaded-count label, expose an explicit
  load-more button while `hasNextPage`, prevent duplicate fetches, and show a
  retryable page error without discarding already loaded cards. Add any new
  visible strings to every Tasks-shipped English/Vietnamese message bundle and
  run `bun i18n:sort`.
- Document the same GET parameters, envelope, note fields, `400/401/403/500`,
  and no-store semantics in `apps/backend/api/openapi.yaml`. The description
  must say POST still falls through and Web remains production authority.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`,
`$vercel-react-best-practices`, and `$tuturuuu-commit`. Read root,
`apps/backend/AGENTS.md`, and any nearer AGENTS files. Execute from completed
Plan 163 only after Plan 154 is green. Inspect all active coordination notes,
obtain the exact artifact transfers named in Status, and inventory every caller
with the command below. A supported external raw-array caller is a STOP and
requires a versioned migration rather than silent breakage.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n '/api/v1/workspaces/.*/notes|listWorkspaceTaskNotes|workspaces_wsid_notes' apps packages --glob '!apps/database/supabase/migrations/**'` | every GET caller and handler is classified; no unsupported raw-array consumer |
| Tasks route | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/notes/route.test.ts'` | auth, archived, limits, cursor/null/tie pages, errors, and unchanged POST cases pass |
| Web route | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/notes/route.test.ts'` | Tasks-equivalent page fixtures and unchanged POST pass |
| Typed client and UI | `bun --cwd packages/internal-api vitest run src/task-notes.test.ts && bun --cwd packages/tasks-ui vitest run src/tu-do/notes/note-list.test.tsx` | query/envelope plus initial/load-more/retry/archive-toggle cases pass |
| Database focused | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/task-notes-pagination.sql` | composite index, >1,000-row traversal, ties, null timestamps, and archived isolation pass |
| Database full/typegen | `bun --cwd apps/database sb:validate:isolated && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/task-notes-pagination.sql` | full pgTAP baseline and generated types pass without unrelated drift |
| Rust focused | `cargo test --manifest-path apps/backend/Cargo.toml workspaces_wsid_notes` | exact query, envelope, cursor validation, tie/null, auth, and GET/POST fallthrough fixtures pass |
| Backend/OpenAPI | `bun check:backend` | formatting, lint, native/Worker compile, tests, and OpenAPI contract pass |
| Route artifacts | `bun web:api-routes:check && bun migration:tanstack:manifest` | legacy wrapper is not regenerated and manifest records the first-class Web source |
| Types | `bun run --cwd apps/tasks type-check && bun run --cwd apps/web type-check && bun run --cwd packages/internal-api type-check && bun run --cwd packages/tasks-ui type-check` | exit 0 with the shared row/envelope contract |
| Builds | `bun run --cwd apps/tasks build && bun run --cwd apps/web build` | both production builds exit 0 |
| Repository | `bun check && git diff --check` | all repository gates pass; whitespace output is empty |

## Scope

**In scope:** Tasks notes collection route/helper and focused tests; moving the
Web notes collection implementation from the legacy file into its existing
first-class destination plus focused tests while preserving POST; shared
internal-api note page types/client/cursor helper and export/tests; Tasks UI
note-list paging/tests and only the English/Vietnamese message bundles required
for new labels; the prepared Rust notes handler/tests; one additive notes index
migration and pgTAP; generated database types only if typegen changes them;
OpenAPI notes GET; generated TanStack route manifest.

**Out of scope:** note creation/update/delete/archive/conversion semantics;
changing TipTap JSON validation or imposing a new document-size limit; adding a
note-detail GET; changing note RLS/membership/app-session policy; server-side
auto-draining; offset pagination or exact total counts; unrelated Tasks UI;
Rust POST; production backend cutover; applying a production migration;
unrelated OpenAPI/manifest reformatting; editing `route-overrides.json` when no
matching entry exists.

## Git workflow

- Work only after active ownership transfer in an isolated branch named
  `perf/245-cursor-page-task-notes`.
- Before staging or committing, claim the repository commit window. Stage only
  Scope paths, use a Conventional Commit such as
  `perf(tasks): cursor-page rich text notes`, then release the window.
- Do not push, open a PR, apply production database changes, or update
  `plans/README.md` unless the operator explicitly requests it.

## Steps

1. Freeze the exact envelope and cursor fixtures in the internal-api, Tasks,
   Web, Rust, and UI tests before implementation. Cover defaults, bounds,
   malformed/versioned cursors, equal timestamps, null timestamps, archived
   separation, auth/membership failures, source failures, and POST fallthrough.
2. Create the additive composite-index migration and pgTAP fixture. Seed more
   than 1,000 creator-owned notes plus other-workspace/other-creator/archive
   distractors; traverse every page and prove no omission or duplicate under
   timestamp ties and legacy null timestamps.
3. Implement the strict shared TypeScript row/page/cursor contract and typed
   client. Update the Tasks GET to `limit + 1` keyset paging while leaving POST
   and `TASK_NOTES_APP_SESSION_AUTH` unchanged.
4. Verify the existing destination contains only the generated GET/HEAD/POST
   re-exports, remove that wrapper, then `git mv` the legacy collection
   `route.ts` into the now-empty first-class destination and create its
   colocated test. Preserve POST and the wrapper's HEAD semantics, and implement
   byte-equivalent GET page fixtures. Do not move or change the separate
   `[noteId]` or conversion routes.
5. Update the prepared Rust GET to parse the exact contract, build the same
   PostgREST filter/order/`limit + 1`, and return the same envelope. Keep every
   non-GET returning `None`. Add the exact OpenAPI path without implying live
   Rust traffic.
6. Convert `NoteList` to the shared typed client and infinite-page state. Keep
   already loaded notes visible during later-page fetch/retry, reset pages on
   archived toggle, disable duplicate loads, and retain rich-text card/edit and
   conversion behavior. Add and sort bilingual strings if required.
7. Regenerate route/type artifacts and run every focused, database, Rust,
   typecheck, build, repository, whitespace, and exact-scope gate above.

## Done criteria

- [ ] Every GET returns at most 100 complete note rows in the exact envelope;
      no handler or UI path auto-drains the history.
- [ ] More than 1,000 notes traverse without the PostgREST cap, duplicates, or
      omissions, including equal and null `created_at` values.
- [ ] Tasks, Web, Rust, OpenAPI, and internal-api agree on parameters, cursor,
      statuses, fields, envelope, and no-store behavior.
- [ ] Tasks UI loads additional pages explicitly, reports loaded rather than
      total count, preserves loaded cards on retry, and resets archive pages.
- [ ] POST/mutation, HEAD, authorization, rich-text, edit, and conversion
      behavior is unchanged; Rust non-GET still falls through.
- [ ] The composite index and pgTAP evidence exist; the Web handler is
      first-class; route/type artifacts contain only expected changes.
- [ ] All commands in Commands and expected results pass.
- [ ] `git status --short` shows no modified path outside Scope.

## STOP conditions

Stop and report without improvising if Plan 154 is red, the Plan 163 execution
base is unavailable, any active owner has not transferred an in-scope path, a
caller still requires the raw array, nullable timestamp order
cannot be reproduced identically in Web and Rust; Tasks and Web differ in an
auth/status/mutation behavior that the page contract would alter; PostgREST
cannot express the stated tuple boundary without fetching an unbounded
intermediate; changing `[noteId]`, conversion, RLS, or TipTap validation becomes
necessary; route generation tries to recreate the legacy wrapper or requires a
new override; typegen/manifest/OpenAPI includes unrelated fleet changes; an
in-scope file drifted incompatibly from `cdef1c5533`; or any mandatory gate
fails twice after one reasonable correction.

## Maintenance notes

Reviewers should compare encoded cursor fixtures between TypeScript and Rust,
inspect the exact `NULLS LAST` boundary, and confirm the extra row never leaks
into `notes`. A later payload-reduction plan may add metadata previews plus a
detail GET, and a separate input-hardening plan may bound total TipTap tree
size; neither concern should be folded into this pagination change.
