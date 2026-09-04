# Plan 315: Page Microsoft Calendar Events Before Absence-Based Deletion

> **Executor instructions:** Treat Microsoft event absence as authoritative
> only after the complete bounded Graph `calendarView` traversal succeeds.
> Never delete local events from a first page, capped traversal, cyclic
> continuation, or failed continuation request.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/microsoft/src/calendar/index.ts packages/microsoft/src/calendar/index.test.ts 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/sync/route.ts' 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/sync/route.test.ts' apps/calendar/src/lib/calendar/microsoft-inbound-sync.ts apps/calendar/src/lib/calendar/microsoft-inbound-sync.test.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — canonical Calendar sync route requires transfer
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM-HIGH
- **Category:** correctness / destructive synchronization
- **Depends on:** Plans 115 and 312; Calendar sync-route transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

Microsoft Graph returns at most the requested first 500 events, but the inbound
sync treats that page as the complete provider calendar. A busy calendar can
therefore lose valid local mirrored events merely because their provider rows
appear after page one.

## Current state and exact contract

- `packages/microsoft/src/calendar/index.ts:111-128` requests `calendarView`
  with `$top: 500` and returns only `response.value`; it ignores
  `@odata.nextLink`.
- `calendar/sync/route.ts:225-235` builds the authoritative provider-ID set from
  that array. Lines 288-321 delete every in-range local Microsoft row absent
  from it when connection deletion sync is enabled.
- Preserve the public `fetchMicrosoftEvents(...): Promise<Event[]>` export and
  its first-page behavior because `@tuturuuu/microsoft/calendar` is published.
  Add `fetchCompleteMicrosoftEvents` with the result
  `{ events, complete, pages, incompleteReason }`, and switch only the Calendar
  host to the additive function. Traverse at most 20 pages
  and 10,000 events. A final page without `@odata.nextLink` is complete; a
  repeated link, invalid link, page/event cap, or continuation failure is
  incomplete. Preserve the fetched prefix for safe upsert.
- Accept only HTTPS continuation URLs. After the first provider-issued link,
  every later link must retain that first link's origin and the same
  calendar-view pathname; reject user-info, fragments, or a changed path.
  Keep query parameters opaque because Graph owns its continuation tokens.
- Extract Microsoft inbound orchestration from the 763-line route into
  `apps/calendar/src/lib/calendar/microsoft-inbound-sync.ts`, leaving a thin
  route call and keeping every substantially edited source below 700 lines.
- The sync may upsert non-cancelled events from an incomplete traversal, but it
  must not query/delete absence candidates. Extend the existing Microsoft
  summary with `incompleteConnections: number` and
  `incompleteReasons: Record<MicrosoftIncompleteReason, number>`, where the
  closed reason union is `continuation_failed | cycle | invalid_continuation |
  page_cap | event_cap`. Initialize every key to zero and aggregate across all
  connections; do not return calendar IDs or provider URLs. A thrown first-page
  request remains a failed sync under the existing route error contract.
- On a complete traversal, preserve current conversion, field limits, upsert,
  deletion filters, response status, and counters.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Obtain exact transfer for the canonical sync route and
rebase over Plans 115/312. Use fake Graph clients only; do not contact Microsoft
or run a live calendar sync.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Microsoft helper | `bun vitest run packages/microsoft/src/calendar/index.test.ts` | multipage, cap, cycle, URL validation, and continuation-failure cases pass without network access |
| Calendar route | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendar/sync/route.test.ts'` | complete pages permit deletion; every incomplete result suppresses the absence query/delete |
| Extracted orchestration | `bun --cwd apps/calendar vitest run src/lib/calendar/microsoft-inbound-sync.test.ts` | multi-connection aggregation and safe partial-upsert behavior pass |
| Package/app types | `bun run --cwd packages/microsoft type-check && bun run --cwd apps/calendar type-check` | both TypeScript projects compile |
| Calendar build | `bun run --cwd apps/calendar build` | the production app build succeeds |
| Source size | `wc -l 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/sync/route.ts' apps/calendar/src/lib/calendar/microsoft-inbound-sync.ts` | each substantially edited source is below 700 lines |
| Repository | `bun check && git diff --check` | canonical checks pass and the diff is whitespace-clean |

## Scope

**In scope:** Microsoft Calendar helper and focused test; canonical Calendar
sync route/test; extracted Microsoft inbound orchestrator/test;
`plans/README.md` status only.

**Out of scope:** Google sync; outbound provider creation; OAuth/scopes;
interactive Calendar POST/PUT/DELETE; database schema/type generation; Rust
(it does not own this mutation path); production provider calls.

## Steps

1. Add fake-client helper tests for two pages, empty final page, repeated link,
   changed origin/path, non-HTTPS URL, continuation failure, and both caps.
2. Keep the existing public first-page export unchanged; add and test the
   bounded complete-traversal export and continuation validation without
   mutating or logging provider tokens.
3. Extract the Microsoft inbound function from the oversized route. Update
   route/orchestrator tests so incomplete results upsert their safe
   prefix but never select or delete absence candidates; surface incomplete
   accounting using the exact closed summary fields above.
4. Preserve complete-enumeration behavior and run every focused type, build,
   repository, whitespace, and exact-scope gate.

## Done criteria

- [ ] More than 500 events are traversed and reconciled across Graph pages.
- [ ] No incomplete traversal can trigger an absence-based local deletion.
- [ ] Cyclic, invalid, failed, and capped continuations are bounded and visible.
- [ ] The published `fetchMicrosoftEvents` signature and first-page behavior are unchanged.
- [ ] Complete sync behavior, status, conversion, and counters remain compatible.
- [ ] Every substantially edited source remains below 700 lines.
- [ ] No live provider is called and every mandatory gate passes.

## STOP conditions

Stop on exact-route ownership conflict; Graph sovereign-cloud support that
invalidates the frozen continuation-origin rule; a current caller requiring the
new complete result but unable to adopt it additively; inability to distinguish
complete from capped enumeration; an edited source remaining above 700 lines;
a required database migration; or any mandatory gate failing twice.
