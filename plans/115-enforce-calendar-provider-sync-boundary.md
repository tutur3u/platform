# Plan 115: Enforce the Calendar Provider-Sync Boundary

> **Executor instructions:** Retire the two unreferenced legacy provider-write
> endpoints and require `manage_calendar` for manual use of the canonical
> workspace sync route. Derive cron-only cooldown treatment exclusively from
> verified cron authentication; caller JSON must never elevate a manual run.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/calendar/src/app/api/v1/calendar/auth/sync apps/calendar/src/app/api/v1/calendar/auth/sync-to-google 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/sync' apps/calendar/src/lib apps/web/src/__tests__/calendar-sync.test.ts tmp/agent-coordination`
> Stop on provider-sync authorization, callers, or exact-path ownership drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** Plans 031 and 086 must be DONE; both reviewed Calendar
  worktrees remain blocked by mandatory environment/database gates
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** security / migration
- **Depends on:** Plans 031 and 086
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

The workspace-less legacy route receives an admin-backed client for Calendar
app sessions and writes local Google linkage by caller-selected event ids. A
second legacy route lets any workspace member copy the workspace event set to
their Google account. The canonical route also checks membership rather than
the `manage_calendar` capability that gates the Calendar product.

## Current state

- `calendar/auth/sync/route.ts:47-121` has no workspace contract and updates
  `workspace_calendar_events` by caller-selected id; its 404 cleanup repeats
  this at lines 294-306.
- `calendar/auth/sync-to-google/route.ts:26-113` checks membership only, then
  loads workspace events and performs provider writes.
- Repository-wide source search finds no live caller for either legacy path.
- `workspaces/[wsId]/calendar/sync/route.ts:67-100` returns verified
  `isCronAuth`, but POST ignores it: lines 589-592 derive `vercel_cron` from
  caller-controlled `body.source === 'cron'`, and lines 618-623 skip the manual
  cooldown for that label. Any otherwise authenticated manual caller can
  self-label as cron without the cron credential.
- The canonical route accepts only `inbound`, `outbound`, or `both`; its cron
  caller currently sends `source: 'cron'`. Parse the complete body with a
  strict schema, default direction to `inbound`, retain `source` only as an
  optional compatibility field, and never use it as authority. Set trigger
  source only as `access.isCronAuth ? 'vercel_cron' : 'manual'`.
- `apps/web/src/__tests__/calendar-sync.test.ts` imports no handler and tests
  self-created mocks rather than either live route.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Execute only after
Plans 031 and 086 so the canonical sync route can reuse the established
Calendar permission guard without conflicting edits. Re-run caller search and
stop if a supported client of either legacy path appears.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Canonical sync tests | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendar/sync/route.test.ts'` | manual/cron authorization and sync contracts pass |
| Legacy absence | `rg -n 'calendar/auth/(sync|sync-to-google)' apps/calendar/src packages/internal-api/src apps/web/src apps/infrastructure/src` | no live caller or route implementation; only intentional negative-test text if any |
| Calendar typecheck | `bun run --cwd apps/calendar type-check` | exit 0 |
| Calendar build | `bun run --cwd apps/calendar build` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- delete both legacy Calendar route files
- delete the mock-only Web legacy sync test
- canonical workspace sync authorization helper/route and its focused test
- `plans/README.md` only for status

Do not redesign provider synchronization, ranges, locks, cooldown durations,
cron scheduling, or response payloads. Closing caller-controlled trigger-source
classification is in scope; provider dispatch/settlement is not.

## Git workflow

Use branch `fix/calendar-provider-sync-boundary` in an isolated worktree and run
`bun setup`. Commit `fix(calendar): enforce provider sync authorization`. Claim
the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Prove legacy routes are unsupported

Search source, internal-api facades, mobile, docs, and deployment configuration
for both paths. Confirm the Web test imports no handler. If a supported caller
exists, stop and specify its migration before deleting anything.

### Step 2: Retire workspace-less and duplicate provider writes

Delete both legacy handlers and the mock-only test. Do not preserve body- or
query-selected workspace compatibility outside the canonical workspace route.

### Step 3: Authorize manual canonical sync

For non-cron requests, require the same normalized actor and `manage_calendar`
guard established by Plan 086 before creating the admin client, decrypting
events, or contacting providers. Keep cron access restricted to the existing
non-empty configured secret and do not broaden app-session audiences.

Parse the body strictly before privileged work. Preserve the three supported
directions, default, and optional cron caller compatibility field, but derive
dashboard source/type and cooldown exemption only from `access.isCronAuth`. A
cookie or app-session request containing `source: 'cron'` remains manual and
cooldown-bound; do not add a second cron credential or trust a body/query flag.

### Step 4: Characterize all sync actors

Test cookie and Calendar app-session users with and without permission,
nonmembers, wrong-target app sessions, malformed workspace ids, valid cron,
missing/wrong cron secret, invalid direction/unknown body keys, lock/cooldown,
and success. Prove session/app-session callers that submit `source: 'cron'`
remain manual and receive the existing 429 during cooldown, while only a valid
cron credential bypasses it. Assert denials perform no admin/provider work.

### Step 5: Run both host gates

Run focused tests, source absence, both type/build gates, `bun check`, and
whitespace.

## Done criteria

- [ ] No workspace-less or duplicate legacy provider-write endpoint remains.
- [ ] Manual canonical sync requires `manage_calendar` before privileged work.
- [ ] Only verified cron authentication selects `vercel_cron` and bypasses the
      manual cooldown; caller JSON cannot elevate trigger source.
- [ ] Mock-only legacy coverage is replaced by real canonical route coverage.
- [ ] `test ! -e apps/web/src/__tests__/calendar-sync.test.ts` exits 0.
- [ ] Calendar/Web builds and repository gates pass.

## STOP conditions

Stop if Plans 031/086 are not complete, a supported legacy caller appears, the
canonical permission differs from `manage_calendar`, the current direction
contract has supported values beyond the three named above, cron requires a new
credential contract, or an in-scope gate fails twice.

## Maintenance notes

Provider synchronization can disclose decrypted workspace event content; its
manual authorization must stay aligned with event read permission.
