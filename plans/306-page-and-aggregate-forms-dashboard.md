# Plan 306: Page and Aggregate the Forms Dashboard at the Data Source

> **Executor instructions:** Replace the full-catalog/full-history Forms
> dashboard read with one bounded, stable summary page. Never count by loading
> raw session or response rows through PostgREST.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/forms/src/features/forms/server.ts apps/forms/src/features/forms/server/queries.ts apps/forms/src/features/forms/server/form-list.ts apps/forms/src/features/forms/server/form-list.test.ts 'apps/forms/src/app/[locale]/[wsId]/forms/page.tsx' 'apps/forms/src/app/api/v1/workspaces/[wsId]/forms/route.ts' 'apps/forms/src/app/api/v1/workspaces/[wsId]/forms/route.test.ts' apps/backend/src/workspaces_forms.rs apps/backend/src/workspaces_forms/tests.rs apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the nonterminal Forms handoff owns `apps/forms/**`
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** performance / correctness
- **Depends on:** Forms exact-path transfer; Plans 111 and 302 sequencing; Plan 154 green baseline; completed Plan 163; database/type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

The dashboard fetches every form, then every matching session and response row,
and repeatedly filters those arrays once per form. PostgREST caps can silently
under-count busy forms while the page still renders plausible totals; below the
cap, database transfer, server CPU, and DOM work grow with the complete catalog
and response history.

## Current state and exact contract

- `apps/forms/src/features/forms/server/queries.ts:33-50` selects `*` for every
  form without a range. Lines 52-64 fetch every session and response for the
  IDs, and lines 72-81 scan both arrays per form. Query errors are discarded.
- `apps/forms/src/app/[locale]/[wsId]/forms/page.tsx:44-63` loads the full result
  before status filtering. `apps/forms/src/app/api/v1/workspaces/[wsId]/forms/route.ts:29-36`
  returns the same unbounded list.
- `apps/backend/src/workspaces_forms.rs:135-240` is the registered prepared GET
  owner for the same collection and currently returns the same unbounded
  `{items}` envelope. Update it in the same change to call the identical summary
  RPC and enforce the same required-paging envelope. Extract its focused tests
  to `apps/backend/src/workspaces_forms/tests.rs` before the 531-line handler can
  approach 700 lines; keep method fallthrough behavior unchanged.
- Extract the substantially changed list contract to
  `apps/forms/src/features/forms/server/form-list.ts`; leave `queries.ts` as a
  thin compatible re-export for existing imports.
- Add private service-role-only `list_workspace_form_summaries(p_ws_id uuid,
  p_query text, p_status text, p_cursor_updated_at timestamptz, p_cursor_id uuid,
  p_limit int) RETURNS jsonb`. It always returns one object
  `{"items":[...],"count":<exact filtered total>,"nextCursor":<tuple object or null>}`,
  including when a valid cursor is beyond the last row; never encode metadata
  only as repeated set-returning columns. Items contain only dashboard fields
  plus exact grouped session, response, and completion counts. It is
  `SECURITY DEFINER`, migration-owner-owned, fixed-safe-search-path, fully
  qualified, revoked from `PUBLIC`/`anon`/`authenticated`, and granted only to
  `service_role`.
- Order exactly by `updated_at DESC, id DESC`; cursor comparison uses the same
  tuple and every tie traverses once. The opaque cursor is unpadded base64url of
  canonical UTF-8 JSON `{"updatedAt":"<RFC3339>","id":"<uuid>"}`. Decoding
  must yield exactly both valid fields; missing, extra, or malformed values
  return sanitized 400 `FORM_LIST_CURSOR_INVALID`. The RPC receives both
  decoded tuple fields or both NULL, never a half cursor.
- The dashboard helper requires an options object and uses `limit: 30`,
  optional `cursor`, and status default `active`. Its URL query names are `q`,
  `status`, and `cursor`; status is
  `all|active|archived|draft|published`. Preserve the current status mapping and
  current `ILIKE` behavior, including `%` and `_` wildcard semantics.
- The HTTP GET query names are `q`, `status`, `cursor`, and `limit`. To avoid a
  plausible truncated replacement for the old complete-list contract, `limit`
  is required and must be an integer 1..100; omission returns sanitized 400
  `FORM_LIST_PAGINATION_REQUIRED`. GET status defaults to `all`, matching the
  old collection semantics. This is an intentional fail-explicit compatibility
  break: inventory and migrate every supported caller rather than silently
  returning only the first 30 rows.
- Return exactly `{ items, count, nextCursor }`, for example
  `{"items":[],"count":0,"nextCursor":null}`. `count` is the exact filtered
  form count, not page length; `nextCursor` is the canonical base64url string or
  NULL. The server page uses explicit cursor links or a focused client load-more
  component and must not preload later pages.
- Count summaries set-wise in SQL for only the page's form IDs. Never select
  raw sessions/responses into application memory. Any query/RPC failure returns
  a sanitized non-2xx response/page error, never zero counts.
- Preserve actor/tenant authorization, form-card fields, status tabs, create
  flow, and cache behavior. Plan 302's export snapshots and Plan 111's response
  detail page remain separate contracts.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain Forms and
database/type ownership, then inventory every `listForms` and Forms API caller.
Use isolated synthetic fixtures only.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused Forms | `bun --cwd apps/forms vitest run src/features/forms/server/form-list.test.ts 'src/app/api/v1/workspaces/[wsId]/forms/route.test.ts'` | bounds, filters, errors, and cursor cases pass |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/form-dashboard-pages.test.sql --typegen packages/types/src/supabase.ts` | >1,000 counts, ties, filters, tenant ACL, and page bounds pass |
| Typegen determinism | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot"` | second generated output is byte-identical |
| Callers | `rg -n 'listForms' apps/forms/src/features/forms/server.ts apps/forms/src/features/forms/server 'apps/forms/src/app/[locale]/[wsId]/forms/page.tsx' 'apps/forms/src/app/api/v1/workspaces/[wsId]/forms/route.ts'` | exactly the export plus the page and collection route callers are inventoried and bounded |
| Forms | `bun run --cwd apps/forms test && bun run --cwd apps/forms type-check && bun run --cwd apps/forms build` | Forms suite/types/build pass |
| Rust parity | `cargo test --manifest-path apps/backend/Cargo.toml workspaces_forms` | prepared GET auth, filters, envelope, ties, and paging match Forms |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Size | `wc -l apps/forms/src/features/forms/server/queries.ts apps/forms/src/features/forms/server/form-list.ts apps/backend/src/workspaces_forms.rs apps/backend/src/workspaces_forms/tests.rs` | every substantially edited source remains below 700 lines |

## Scope

**In scope:** Forms server export; list query extraction/test; dashboard page
pagination; Forms collection GET/test; prepared Rust collection handler and
extracted tests/module registration; one summary RPC migration/pgTAP; generated
types.

**Out of scope:** response-detail paging from Plan 111; exports from Plan 302;
form builder/schema changes; response mutations; unrelated Forms routes;
production migration application.

## Steps

1. Inventory callers and add red route/helper tests for required HTTP limits,
   page/API default differences, exact cursor encoding, malformed cursors and
   status, query errors, exact counts, empty beyond-last pages, and later-page
   traversal.
2. Add the summary RPC with exact ACL, stable tuple ordering, server-side
   filtering, page-only set aggregation, and pgTAP above PostgREST's row cap.
3. Extract `form-list.ts`, retain a thin stable re-export, and map the RPC to the
   additive `{items,count,nextCursor}` envelope without masking errors.
4. Make the dashboard request one bounded page and expose deliberate next-page
   navigation/load-more without preloading the catalog.
5. Port the exact GET query/envelope to Rust, preserve unsupported-method
   fallthrough, and add matching auth/filter/tie/page/error tests.
6. Run focused, database/typegen, Forms suite/type/build, Rust, repository, size,
   whitespace, and scope gates.

## Done criteria

- [ ] No dashboard request selects an unbounded form/session/response collection.
- [ ] Counts remain exact with more than 1,000 aggregate session/response rows.
- [ ] Equal timestamps traverse every form once with page size at most 100.
- [ ] Status/search behavior and existing card fields remain compatible.
- [ ] Legacy unpaginated GET fails explicitly instead of returning a partial list.
- [ ] Database failures cannot render fabricated zero counts.
- [ ] Forms and prepared Rust GET return the same bounded envelope and filtering.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on active Forms ownership; a caller requiring the old raw unbounded array;
status/search semantics that differ between supported callers; an aggregate
that cannot be scoped to page IDs without changing response meaning; migration
or generated-type conflict; a substantially edited file above 700 lines; or a
mandatory gate failing twice.

## Maintenance notes

Dashboard summaries, response-detail pages, and exports are three independent
bounded contracts. Do not make one call the other to save implementation work.
