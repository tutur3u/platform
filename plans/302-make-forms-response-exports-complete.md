# Plan 302: Make Forms Response Exports Complete and Bounded

> **Executor instructions:** Separate exports from the interactive response
> page. Stream every CSV row from a stable snapshot and reject oversized XLSX
> explicitly instead of returning a plausible truncated file.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/forms/src/app/api/v1/workspaces/[wsId]/forms/[formId]/responses/export' apps/forms/src/features/forms/server apps/forms/src/features/forms/studio/responses-panel.tsx apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the nonterminal Forms handoff owns `apps/forms/**`
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** performance / export correctness
- **Depends on:** Forms exact-path transfer; Plan 154 green baseline; completed Plan 163; database/type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

Both download links request page 1 with `pageSize: 5000` and present the result
as a complete export. Larger forms silently lose responses. The shared page
helper also loads every matched ID, metadata row, and answer before returning
only the first page, while CSV/XLSX are fully materialized in memory.

## Current state and exact contract

- `responses/export/route.ts:44-48` hard-codes the first 5,000 records;
  `:53-119` builds the full row graph and output in memory.
- `server/queries.ts:115-149` loads the complete matched set and answers even
  when only one page is returned. Plan 111 explicitly excludes export limits;
  do not alter the interactive analytics contract in this plan except to stop
  the export route from calling it.
- Add durable private `form_response_export_snapshots` and
  `form_response_export_snapshot_rows` storage. One preparation RPC validates
  form/workspace/query and materializes, in one transaction, the exact ordered
  response IDs plus exported submitted-at/responder/answer values and the
  ordered column schema. Updates or deletes after preparation cannot change the
  export. Snapshots expire after one hour; preparation performs bounded cleanup
  of expired snapshots, while completion deletes the current snapshot. An
  interrupted export may leave only its expiring snapshot, never source-form
  mutations.
- Order materialized rows by `(submitted_at DESC, id DESC)`. The page RPC takes
  the snapshot UUID, opaque lower cursor, and limit 1..250, and returns only
  stored immutable page values plus `nextCursor`. Literal search/filter
  semantics must match the current response helper. Reject preparation before
  snapshot insertion when the union of current question columns and stored
  legacy answer keys exceeds 500, returning sanitized 413 JSON with code
  `FORM_EXPORT_TOO_WIDE`; both CSV and XLSX use this exact cap.
- The private preparation/page functions are `SECURITY DEFINER`, owned by the
  migration owner, use a fixed safe `search_path` plus fully qualified objects,
  `REVOKE ALL` from `PUBLIC`, `anon`, and `authenticated`, and grant EXECUTE
  only to `service_role`.
- CSV writes the header once and streams pages through `ReadableStream`, using
  current quoting/escaping and UTF-8. It never holds more than one 250-row page
  plus the at-most-500-column schema. A client disconnect stops later page
  reads; snapshot expiry is the cleanup fallback.
- XLSX remains synchronous only at an explicit maximum of 5,000 matched rows.
  It retrieves them through bounded pages, then builds the workbook. If the
  prepared count exceeds 5,000, return sanitized 413 JSON with code
  `FORM_EXPORT_XLSX_TOO_LARGE` and direct the caller to CSV; never emit a partial
  workbook. CSV has no silent row cap.
- Concurrent submissions after preparation are excluded. Updates and deletes
  after preparation do not alter the materialized values, row membership, or
  column schema. Preparation itself is one database transaction, so it either
  publishes a complete snapshot or no snapshot.
- Preserve auth, tenant/form 404, `q`, format aliases, column labels, responder
  fallback, filenames, and content types. Database failures before headers
  return sanitized 500; failures after CSV streaming begins terminate the
  stream and log metadata only.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain the Forms and
database/type transfers. Inventory supported export callers. Use isolated
Supabase and generated fixtures; never load production form contents.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused Forms | `bun --cwd apps/forms vitest run 'src/app/api/v1/workspaces/[wsId]/forms/[formId]/responses/export/route.test.ts' src/features/forms/server/response-export.test.ts` | 5,001+, ties, immutable updates/deletes, width/XLSX caps, cancellation, and failures pass |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/form-response-export-pages.test.sql --typegen packages/types/src/supabase.ts` | atomic immutable snapshots, bounded pages, expiry, and tenant ACL pgTAP pass |
| Typegen determinism | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot"` | second isolated generation is byte-identical |
| Forms | `bun run --cwd apps/forms test && bun run --cwd apps/forms type-check && bun run --cwd apps/forms build` | Forms suite/types/build pass |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** export route/test; focused export server helper/test; minimal
responses-panel error handling only if needed for the explicit XLSX 413; one
migration/pgTAP; generated types.

**Out of scope:** interactive response pagination/analytics from Plan 111;
form schema/editor changes; production object storage; email delivery; generic
job framework; unrelated Forms routes.

## Steps

1. Add 5,001-response, equal-timestamp, literal-query, legacy-column, escaping,
   update/delete-after-preparation, 501-column, XLSX-limit, cancellation,
   expiry, and injected database-failure tests.
2. Add the durable private snapshot/row tables and atomic prepare/page/complete
   contract with strict cursor/cardinality validation, service-role-only ACL,
   immutable values, stable ordering, bounded expiry cleanup, and pgTAP above
   the row cap.
3. Implement a focused export helper. Stream CSV one page at a time; preflight
   count before any XLSX bytes and reject above 5,000.
4. Point the route only at the export helper, preserve auth/envelopes/headers,
   and add narrow UI handling only if current downloads cannot surface 413.
5. Run focused, isolated database/typegen, Forms suite/type/build, repository,
   whitespace, and exact-scope gates.

## Done criteria

- [ ] CSV exports every captured matching response without a 5,000-row cap.
- [ ] CSV memory/database work is bounded to 250 rows per page.
- [ ] A prepared export is immutable across later response updates/deletes and expires within one hour if abandoned.
- [ ] More than 500 columns fails explicitly before snapshot/file creation.
- [ ] XLSX above 5,000 fails explicitly before emitting a file.
- [ ] Tied timestamps traverse once with no omissions or duplicates.
- [ ] Auth, tenant, filters, columns, filenames, and escaping remain compatible.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on active Forms ownership; historical response payloads that cannot be
materialized without exposing protected fields; an external caller requiring
silent partial XLSX compatibility; a reviewed requirement above the 500-column
or 5,000-row XLSX caps; migration/type conflict; or any mandatory gate failing
twice.

## Maintenance notes

Interactive pages and exports have different contracts. Never reuse a bounded
UI page as evidence that a downloadable export is complete.
