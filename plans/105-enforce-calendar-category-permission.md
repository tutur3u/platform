# Plan 105: Enforce Calendar Category Permission End to End

> **Executor instructions:** Make `manage_calendar` the single authorization
> boundary for category reads and mutations in the Calendar API and RLS. Keep
> response shapes, validation, ordering behavior, and app-session audiences
> unchanged.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/categories' 'apps/calendar/src/app/[locale]/(dashboard)/[wsId]/page.tsx' apps/calendar/src/lib apps/database/supabase/migrations apps/database/supabase/tests`
> Stop on category authorization/policy drift or if Plan 086 is incomplete.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** Plan 086 must be DONE; its reviewed Calendar event/RLS
  worktree must be replayed atop Plan 151 and pass the currently red full
  exact-base pgTAP baseline
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** security
- **Depends on:** Plan 086
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The Calendar product page rejects members without `manage_calendar`, but the
category API accepts any workspace member and uses an admin client for creates,
updates, deletes, and reorder writes. Membership-only RLS also lets direct
database clients bypass the intended capability boundary.

## Current state

- `apps/calendar/.../[wsId]/page.tsx:34-39` redirects callers lacking
  `manage_calendar`.
- `categories/route.ts:13-36` and `:65-92` require only membership for GET and
  POST; POST then inserts through the admin client at `:99-125`.
- `categories/[categoryId]/route.ts:13-43,103-133` repeats membership-only
  authorization before admin PATCH/DELETE.
- `categories/reorder/route.ts:16-45` accepts any member and performs admin
  position updates at `:74-92`.
- `20251204165723_add_workspace_calendar_categories.sql:47-90`, as rewritten
  by `20260701070408_wrap_rls_perf_initplan.sql:808-819`, grants every category
  operation to workspace members.
- Plan 086 introduces the canonical satellite-aware `manage_calendar` route
  guard for events. Reuse it rather than adding a second permission engine.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`; read `apps/calendar/AGENTS.md` if present. Do
not begin until Plan 086 is DONE and its guard path is confirmed. Recheck
migration ownership before creating a uniquely named policy-only migration.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| New migration | `bun sb:new enforce_calendar_category_permission` | one additive timestamped migration |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | category policy tests pass |
| Local apply | `bun sb:up` | migration applies locally |
| Category tests | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendar/categories/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/calendar/categories/[categoryId]/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/calendar/categories/reorder/route.test.ts'` | method/actor matrix passes |
| Calendar build | `bun run --cwd apps/calendar build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- the three Calendar category route files and three colocated route tests
- the shared Calendar permission guard created by Plan 086 only if a category
  adapter is required
- one additive policy migration and
  `apps/database/supabase/tests/calendar-category-permission.sql`
- `plans/README.md` only for status

Do not change category response fields, validation limits, colors, order
allocation, reorder atomicity, Calendar navigation, or generated database types.

## Git workflow

Use branch `fix/calendar-category-permission` in an isolated worktree and run
`bun setup`. Commit `fix(calendar): enforce category permission boundary`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize actors and methods

Create tests for cookie and Calendar app-session actors across GET, POST,
PATCH, DELETE, and reorder PUT. Prove anonymous, nonmember, unrelated-target,
and member-without-permission callers are denied before category/admin queries;
`manage_calendar` actors retain exact success, validation, duplicate-name, and
not-found envelopes. Include `personal` normalization.

### Step 2: Reuse the Calendar permission guard

Replace the membership-only branches with the Plan 086 guard. Pass the
normalized workspace and actor into existing queries and preserve tenant
predicates. Do not broaden the accepted satellite targets.

### Step 3: Align category RLS

Create an additive migration that replaces SELECT/INSERT/UPDATE/DELETE policies
on `workspace_calendar_categories` with the established
`has_workspace_permission(..., 'manage_calendar')` predicate. Add pgTAP cases
for authorized, unauthorized-member, anonymous, and cross-workspace access.
This policy-only change must not produce generated-type churn.

### Step 4: Run all gates

Apply locally, run database and route tests, build Calendar, then run `bun check`
and whitespace validation.

## Done criteria

- [ ] Every category method requires `manage_calendar` through the shared guard.
- [ ] Unauthorized actors reach no privileged category query or write.
- [ ] RLS independently rejects members without the capability.
- [ ] Cookie, Calendar app-session, personal-workspace, and denial tests pass.
- [ ] Database apply/tests, Calendar build, repository gate, and whitespace pass.

## STOP conditions

Stop if Plan 086 is not DONE, its guard does not support category routes, a new
exact-path owner appears, a legitimate category-only permission is documented,
generated types change, or a gate fails twice.

## Maintenance notes

Reorder remains a separate correctness concern because its parallel updates can
partially commit. Do not mix that transaction redesign into this permission
plan.
