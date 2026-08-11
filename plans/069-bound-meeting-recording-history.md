# Plan 069: Bound Meeting Recording History

> **Executor instructions:** Stop embedding every session/transcript in Meet
> list responses: return recording counts on meeting cards, cursor-page session
> summaries, and fetch a transcript only when its viewer opens, with Web/Rust
> response parity.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/meetings/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/route.test.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/route.test.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route.test.ts' 'apps/meet/src/app/[locale]/[wsId]/meetings/meetings-content.tsx' 'apps/meet/src/app/[locale]/[wsId]/meetings/meetings-content.test.tsx' 'apps/meet/src/app/[locale]/[wsId]/meetings/[meetingId]/recording-sessions-overview.tsx' 'apps/meet/src/app/[locale]/[wsId]/meetings/[meetingId]/recording-sessions-overview.test.tsx' 'apps/meet/src/app/[locale]/[wsId]/meetings/[meetingId]/recording-session-actions.tsx' 'apps/meet/src/app/[locale]/[wsId]/meetings/[meetingId]/recording-session-actions.test.tsx' packages/internal-api/src/meetings.ts packages/internal-api/src/meetings.test.ts packages/internal-api/src/index.ts apps/backend/src/workspaces_wsid_meetings.rs apps/backend/src/workspaces_meetings_meetingid_recordings.rs apps/mobile/lib/data/models/meet/meet_meeting.dart apps/mobile/lib/features/meet/view/meet_page.dart apps/mobile/test/data/models/meet/meet_meeting_test.dart apps/mobile/test/features/meet/view/meet_page_test.dart apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on response, pagination, route ownership, or migration-artifact drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** Performance / API contracts
- **Depends on:** Plan 066; G22 route/migration artifacts ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The paginated meeting list embeds every recording row for each meeting, while
the recording history endpoint defaults to every historical session and every
full transcript. The UI polls that unbounded payload each minute even though it
usually needs only a count, session metadata, and transcript availability.
History growth therefore turns bounded pages into unbounded database and
network work.

## Current state

- `meetings/route.ts:72-86` embeds all `recording_sessions` rows; Meet consumes
  only `.length` at `meetings-content.tsx:317-322`. The Rust GET mirrors that
  embedded projection in `workspaces_wsid_meetings.rs:230-245`.
- `recordings/route.ts:69-100` reads every table status merely to validate the
  filter. The database enum already defines the six allowed values.
- The same route applies a limit only when supplied, then loads
  `private.recording_transcripts.select('*')` for every result. The Rust port
  reproduces both behaviors.
- `recording-sessions-overview.tsx:25-90` calls without a limit and polls every
  minute. It needs metadata and transcript presence for each card; full text is
  used only after `RecordingSessionActions` opens `TranscriptViewer`.
- Plan 066 moves the session item handler and establishes the exact
  workspace/meeting/session boundary; this plan must build transcript detail
  GET on that corrected first-class route.
- Both collection implementations still live in `legacy-api-routes` behind
  generated first-class wrappers. Substantial query/response changes require
  moving both implementations and their new tests to the first-class API tree.
- `apps/mobile/lib/data/models/meet/meet_meeting.dart:59-80` parses the embedded
  session array, and `meet_page.dart:468-473` displays its length. Mobile must
  migrate to `recordingCount` in the same response-contract slice.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-mobile-task-board`, and
`$tuturuuu-agent-coordination`; also read `apps/mobile/AGENTS.md`. Wait for Plan
066 and the G22 owner, then re-run the backend runtime coverage probe for the
meetings collection, recordings collection, and recording item path. Web is
live, but existing Rust-owned GET methods must change in the same slice.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Web route tests | `bun run --cwd apps/web test -- 'src/app/api/v1/workspaces/[wsId]/meetings/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/meetings/[meetingId]/recordings/[sessionId]/route.test.ts'` | count, cursor, summary, and detail contracts pass |
| Internal API test | `bun run --cwd packages/internal-api test -- src/meetings.test.ts` | query/cursor/detail helpers pass |
| Meet tests | `bun run --cwd apps/meet test -- 'src/app/[locale]/[wsId]/meetings/meetings-content.test.tsx' 'src/app/[locale]/[wsId]/meetings/[meetingId]/recording-sessions-overview.test.tsx' 'src/app/[locale]/[wsId]/meetings/[meetingId]/recording-session-actions.test.tsx'` | count, paging, and lazy transcript behavior pass |
| Mobile focused tests | `cd apps/mobile && flutter test test/data/models/meet/meet_meeting_test.dart test/features/meet/view/meet_page_test.dart` | count parsing and rendering pass |
| Mobile gate | `bun check:mobile` | Dart format, analysis, and full tests pass |
| Backend focused tests | `cargo test --manifest-path apps/backend/Cargo.toml workspaces_wsid_meetings && cargo test --manifest-path apps/backend/Cargo.toml workspaces_meetings_meetingid_recordings` | Rust projections and cursor parity pass |
| Legacy-wrapper guard | `bun web:api-routes:check` | neither moved collection requires a generated wrapper |
| Migration metadata | `bun migration:tanstack:manifest && bun migration:tanstack:check` | changed Web routes remain accurately tracked |
| Backend gate | `bun check:backend` | Web/Rust GET parity and route ownership pass |
| Typechecks | `bun run --cwd packages/internal-api type-check && bun run --cwd apps/meet type-check && bun run --cwd apps/web type-check` | all exit 0 |
| Repository gate | `bun check` | exit 0 |
| App builds | `bun run --cwd apps/meet build && bun run --cwd apps/web build` | both production builds succeed |
| Whitespace | `git diff --check` | no output |

## Scope

- Replace both generated collection wrappers with their moved first-class Web
  implementations and create exact colocated tests; remove both legacy sources
- The Plan-066 first-class recording item handler/test for transcript-detail GET
- `apps/meet` meeting-card, recording-overview, and recording-action components
  plus exact focused tests
- `packages/internal-api/src/meetings.ts`, `src/index.ts`, and
  `src/meetings.test.ts`
- `apps/mobile/lib/data/models/meet/meet_meeting.dart`,
  `apps/mobile/lib/features/meet/view/meet_page.dart`, and new focused model and
  widget tests at the exact paths listed in the drift check
- Rust meetings and recordings GET modules/tests; split either touched module
  before it reaches 700 LOC
- The exact changed route entries in TanStack overrides and regenerated manifest

Do not change recording mutations, transcript generation, playback/upload,
retention policy, meeting page-size limits, or expose transcript data in the
meeting/session summary responses.

## Git workflow

- Branch: `perf/bound-meeting-recording-history` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `perf(meet): bound recording history payloads`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Replace embedded sessions with an aggregate count

For the meetings and recordings collection routes, first `git rm --` each
generated first-class wrapper, then `git mv --` its legacy implementation into
the vacant destination and create the new test beside it. Re-key both exact
source IDs in the override registry; do not leave a legacy implementation or a
second wrapper. The meetings file also owns POST: move it unchanged and add
characterization coverage so the performance work cannot regress meeting
creation while changing GET.

For each meeting row, select the embedded aggregate
`recording_sessions(count)` and map its single count object to
`recordingCount: number`; never select session rows. Preserve the existing
meeting pagination/search/count contract. Implement the same PostgREST
projection and JSON field in Web and Rust, and update Meet cards to consume
only `recordingCount`. Replace Mobile's `recordingSessions` collection with an
integer `recordingCount` parsed from the same field, and keep its existing
localized count label.

### Step 2: Define one bounded session-summary cursor contract

The recordings GET accepts `limit` default 25, maximum 50, and optional opaque
`cursor`. Order by `created_at DESC, id DESC`, fetch `limit + 1`, and encode the
last returned `{ createdAt, id }` as base64url JSON for `nextCursor`. Reject an
invalid cursor or limit with 400. Apply the lexicographic continuation
predicate `(created_at < cursor.createdAt) OR (created_at = cursor.createdAt AND
id < cursor.id)` so equal timestamps cannot skip or duplicate rows.

Return `{ success: true, sessions, nextCursor }`, where each session contains
only `id`, `status`, timestamps, and `hasTranscript`. Query only `session_id`
from the private transcript table for the bounded page, then map membership to
that boolean. Validate `status` against the static six-value enum contract
(`recording`, `interrupted`, `pending_transcription`, `transcribing`,
`completed`, `failed`) rather than scanning the sessions table. Implement
identical parsing, ordering, error bodies, and response fields in Web and the
already-owned Rust GET.

### Step 3: Fetch transcript detail only on demand

After Plan 066, add GET to the first-class session item route. Reuse its
workspace/meeting/session resolver and return
`{ success: true, transcript: RecordingTranscript | null }` without revealing
cross-tenant existence or including session metadata. Preserve the Plan-066
auth contract exactly: 401 anonymous, 500 membership lookup failure, 403 route
workspace nonmember, 404 missing or mismatched meeting/session, 500 private
transcript query failure, and 200 for both transcript and null success. Add a
typed internal API detail helper.
`RecordingSessionActions` requests detail only when the user opens the viewer
and caches it by workspace/meeting/session; cards render from `hasTranscript`
and never receive transcript text.

### Step 4: Add incremental history UI and parity tests

Keep the cursorless first page in its own `useQuery` with the current 60-second
poll so server-side `transcribing` transitions become visible without a user
mutation. Load pages after `firstPage.nextCursor` through a separate
`useInfiniteQuery` with no interval; include that boundary cursor in the older
pages query key so a new first-page boundary safely restarts the historical
chain. Render a deduplicated first page plus older pages and expose an explicit
load-more control. Cover equal timestamps, exactly 25/26 rows, max/invalid
limits, invalid cursor, status validation without a status-table query, lazy
transcript success/null/error, `transcribing` to `completed`/`failed` first-page
polling, and Web/Rust JSON parity.

## Test plan

Route tests assert query shape and response bounds, not only array lengths.
Rust tests assert exact PostgREST filters and parity fixtures. Component tests
prove initial fetch, first-page-only polling, server-side status refresh,
load-more without older-page polling, mutation/focus refresh, and that
transcript detail is absent until the viewer opens. Flutter tests prove `recordingCount`
parsing (including absent/zero) and the existing localized count label without
retaining the removed session array.

## Done criteria

- [ ] Meeting pages perform a set-based count and never embed recording rows.
- [ ] Recording history is cursor-paged at default 25/max 50 with stable tie handling.
- [ ] Summary responses contain only metadata plus `hasTranscript`; transcript bodies load on demand.
- [ ] Web and Rust GET behavior, errors, ordering, and response shapes match.
- [ ] Both substantially changed collection handlers/tests are first-class and
      their two migration source keys are current.
- [ ] The moved meetings POST retains its existing auth, validation, response,
      and failure behavior.
- [ ] Mobile parses and renders `recordingCount` and no longer expects embedded sessions.
- [ ] Transcript detail uses the exact documented 200/401/403/404/500 envelope contract.
- [ ] Focused tests, migration/backend gates, typechecks, `bun check`, builds, and whitespace pass.
- [ ] No mutation, retention, transcription, audio, or unrelated route behavior changes.

## STOP conditions

Stop if Plan 066 or G22 ownership is unresolved, either first-class collection
destination is no longer a generated wrapper, runtime coverage changes,
PostgREST cannot express the specified stable cursor/count projection without
an additive database helper, the UI requires eager transcript bodies for an
unidentified workflow, or Web/Rust parity needs a product-visible contract not
defined here.

## Maintenance notes

Keep list endpoints summary-only and bounded. New transcript fields belong in
the item-detail response unless measured product behavior proves they are
required for every row.
