# Plan 086: Enforce Calendar Event Permission End to End

> **Executor instructions:** Make the `manage_calendar` capability the single
> boundary for workspace event reads and writes in both the Calendar API and
> database policies. Do not broaden satellite audiences or change event shapes.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/events' 'apps/calendar/src/app/[locale]/(dashboard)/[wsId]/page.tsx' apps/calendar/src/lib apps/database/supabase/migrations apps/database/supabase/tests`
> Stop on Calendar authorization, event-policy, or migration drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** the reviewed uncommitted route/policy patch in
  `.worktrees/fix-calendar-event-permission` predates Plan 151 and must be
  replayed onto its disposable-validator base; the mandatory full exact-base
  pgTAP baseline remains red on five unrelated suites confirmed by Plan 150
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** security
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The Calendar page denies members without `manage_calendar`, but the event API
checks only membership and then decrypts or mutates events with an admin client.
Membership-only RLS preserves the same bypass for direct database clients.

## Current state

- `apps/calendar/.../[wsId]/page.tsx:34-39` gates the product on
  `manage_calendar`.
- `calendar/events/route.ts:101-142` authorizes membership only and returns an
  admin client; GET decrypts all matching workspace events.
- POST, PUT, and DELETE reuse that helper, including
  `events/[eventId]/route.ts`.
- `20250705054718_adjust_policy_for_event_table.sql` grants event operations to
  workspace members rather than the product permission.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Read `apps/calendar/AGENTS.md` if present.
Recheck active coordination immediately before creating the uniquely named
migration; no current note owns the Calendar event routes or that migration.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| New migration | `bun sb:new enforce_calendar_event_permission` | one additive timestamped migration |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | new policy tests pass |
| Local apply | `bun sb:up` | migration applies locally |
| Calendar tests | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendar/events/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route.test.ts'` | focused authorization suite passes |
| Calendar build | `bun run --cwd apps/calendar build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- Calendar event collection/item routes and a shared permission guard under
  `apps/calendar/src/lib/`
- focused GET/POST/PUT/DELETE route tests
- one additive event-policy migration and
  `apps/database/supabase/tests/calendar-event-permission.sql`
- `plans/README.md` only for status

Do not change Calendar page navigation, event response fields, provider-sync
semantics, or app-session audience registration.

## Git workflow

Use branch `fix/calendar-event-permission` in an isolated worktree and run
`bun setup`. Commit `fix(calendar): enforce event permission boundary`. Claim
the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize every actor and method

Create route tests for cookie, Calendar app-session, and unrelated-target
actors. For GET/POST/PUT/DELETE prove anonymous, nonmember, and member-without-
permission callers are denied before admin queries, decryption, or provider
writes; `manage_calendar` actors retain current responses. Include `personal`
workspace normalization.

### Step 2: Centralize route authorization

Make the shared event guard resolve the satellite-aware actor, normalize the
workspace, verify membership, and require `manage_calendar` before creating or
returning an admin client. Reuse it from collection and item handlers.

### Step 3: Align database policies

Create an additive migration replacing SELECT/INSERT/UPDATE/DELETE policies on
`workspace_calendar_events` with the established
`has_workspace_permission(..., 'manage_calendar')` pattern. Set explicit
privileges/search-path behavior where helper functions require it. Add pgTAP
coverage for authorized, unauthorized-member, cross-workspace, and anonymous
access.

### Step 4: Verify the complete boundary

Apply locally, run focused tests, the Calendar production build, and
`bun check`. A policy-only migration does not require generated-type churn.

## Done criteria

- [ ] Every event method requires `manage_calendar` after satellite-aware auth.
- [ ] Unauthorized callers reach no admin query, decryption, or provider write.
- [ ] RLS independently denies members lacking the capability.
- [ ] Cookie, Calendar app-session, personal-workspace, and denial tests pass.
- [ ] Database apply/tests, Calendar build, and repository gates pass.

## STOP conditions

Stop if a new exact-path owner appears, the permission is not present in the
target workspace model, a legitimate caller requires a different documented
capability, or a gate fails twice.

## Maintenance notes

Keep the page, API, and RLS capability names identical; a UI-only permission
gate is not an authorization boundary.
