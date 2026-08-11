# Plan 225: Redact Calendar Sync Tokens and Provider Payloads from Logs

> **Executor instructions:** Keep Calendar sync diagnostics useful while making
> it structurally impossible to log raw Google sync tokens or event payloads.
> Preserve sync behavior and provider requests exactly.
>
> **Drift check (run first):**
> `git diff --stat 968bd12018..HEAD -- apps/calendar/src/lib/calendar/incremental-active-sync.ts apps/calendar/src/lib/calendar/incremental-active-sync.test.ts apps/calendar/src/lib/calendar/incremental-active-sync-log-safety.test.ts tmp/agent-coordination`

## Status

- **Execution status:** TODO
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** security / logging / privacy
- **Depends on:** none; coordinate with adjacent retained Calendar plans
- **Planned at:** commit `968bd12018`, 2026-08-11

## Why this matters

The active Google Calendar sync path writes a reusable sync token and the full
provider response into server logs. Provider responses can contain event
titles, descriptions, attendees, conference links, and fresh pagination/sync
tokens, expanding sensitive calendar data into the logging system.

## Current state and exact contract

- `apps/calendar/src/lib/calendar/incremental-active-sync.ts:250-257` logs the
  raw `syncToken` returned from storage.
- Lines 308-324 log `res.data` after every Google events page. The same object
  contains event bodies and `nextPageToken`/`nextSyncToken`.
- This implementation is reached by the canonical Calendar sync route and has
  an existing focused test file, but current coverage only characterizes
  deleted-event tombstones.
- Retain only non-sensitive metadata: booleans, counts, page number, elapsed
  time, fallback mode, provider status/code, and stable internal correlation
  identifiers. Never log token values, raw provider bodies, event objects,
  attendee/email data, descriptions, links, or attachment content. Do not hash
  tokens; even stable fingerprints are unnecessary.
- Preserve requests, pagination, token storage/clearing, 410 fallback, event
  transformation, metrics, status codes, and public responses byte-for-byte.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root instructions. The old Calendar migration note is
canonical `done` and therefore not an active owner, although its author should
archive it as lifecycle hygiene. Coordinate with blocked Plans 031 and 115, but
do not absorb their authorization/provider-sync work.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused log safety | `bun --cwd apps/calendar vitest run src/lib/calendar/incremental-active-sync.test.ts src/lib/calendar/incremental-active-sync-log-safety.test.ts` | representative token/event payloads never reach console arguments; allowed summaries remain |
| Typecheck | `bun run --cwd apps/calendar type-check` | exit 0 |
| Build | `bun run --cwd apps/calendar build` | production build exits 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** incremental active-sync logging and focused log-safety tests.

**Out of scope:** provider request semantics, sync authorization, token storage
or rotation, event persistence, provider-sync scheduling, general Calendar log
cleanup, translations, schema, or generated types.

## Steps

1. Add a red source/runtime contract that supplies sentinel token, event title,
   attendee email, description, link, page token, and next sync token values and
   asserts none appear in any captured `console.*` argument. Assert safe counts,
   booleans, and provider error codes remain observable.
2. Replace raw token/result logging with explicit allowlisted summary objects.
   Never spread provider objects or pass `res.data` to a logger. Preserve log
   severity and the surrounding sync control flow.
3. Run focused/typecheck/Calendar build/repository/whitespace and review
   the diff for every raw provider/token log sink.

## Done criteria

- [ ] No raw sync/page token or provider event payload can reach server logs.
- [ ] Counts, page/fallback state, timing, and safe error codes remain useful.
- [ ] Sync requests, storage, pagination, fallback, persistence, and responses
      are behaviorally unchanged.
- [ ] Focused/typecheck/build/repository/whitespace gates pass.

## STOP conditions

Stop on a newly discovered active exact-path owner, a diagnostic requirement
for raw provider content, unexpected sync behavior changes, incompatible
overlap with Plans 031/115, or any mandatory gate failing twice.
