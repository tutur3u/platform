# Plan 055: Restrict Cross-User Time-Tracking Reads

> **Executor instructions:** Preserve self-service time tracking while requiring
> the established management permission before any admin-backed read of another
> member's sessions or goals.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/sessions/route.ts' 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/sessions/route.test.ts' 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/goals/route.ts' 'apps/track/src/app/api/v1/workspaces/[wsId]/time-tracking/stats/period/route.ts' apps/track/src/lib`
> Stop if the target-user or Track permission contract changed.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `892cd92d78a93ac33ff157e5a648be19131d3690`
  on branch `fix/track-cross-user-read-permission`; 17 focused tests, Track
  typecheck/build, auth guard, `bun check`, whitespace, and hooks passed
- **Priority:** P0
- **Effort:** S
- **Risk:** MED
- **Category:** Security / Privacy authorization
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

An ordinary workspace member can supply another member's user ID and read that
person's running state, session history, descriptions, tasks, categories, and
personal time goals. The routes use the admin client and therefore bypass the
database's own-user read policies.

## Current state

- `sessions/route.ts:453-529` verifies only caller and target membership before
  setting `queryUserId`; lines 538-630 then issue admin-backed target reads.
- `goals/route.ts:17-93` repeats the same membership-only cross-user contract.
- `stats/period/route.ts:173-217` is the maintained exemplar: it requires
  `manage_time_tracking_requests` before validating and reading a target user.
- The session route is already 935 lines. Keep its change minimal and put the
  shared authorization decision in a focused helper rather than enlarging it.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Inspect callers of
both `userId` query parameters and confirm manager views already receive
`manage_time_tracking_requests`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Session tests | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/sessions/route.test.ts'` | self/manager/denial cases pass |
| Goal tests | `bun --cwd apps/track vitest run 'src/app/api/v1/workspaces/[wsId]/time-tracking/goals/route.test.ts'` | self/manager/denial cases pass |
| Track typecheck | `bun run --cwd apps/track type-check` | exit 0 |
| Auth guard | `node scripts/check-internal-app-auth.js` | no satellite actor regression |
| Repository gate | `bun check` | exit 0 |
| Track build | `bun run --cwd apps/track build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Minimal call-site edits in the session and goal routes above
- A focused shared Track server helper under `apps/track/src/lib/time-tracking/`
- Existing session tests and new `goals/route.test.ts`

Do not change session payloads, pagination/filter behavior, write permissions,
or time-tracking request approval semantics.

## Git workflow

- Branch: `fix/track-cross-user-read-permission` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(track): restrict cross-user time reads`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Centralize the target-user decision

Extract a server-only helper that receives request, actor ID, normalized
workspace, target ID, and request-scoped Supabase client. Self-read returns the
actor immediately. A different target first requires
`manage_time_tracking_requests`, then verifies target membership. Preserve 500
for permission/membership lookup failure, 403 for missing management permission,
and 404 for a nonmember target.

### Step 2: Apply it before every admin read

Use the helper in session GET and goal GET before constructing any admin query.
Do not instantiate or query the admin client on rejected cross-user paths.
Retain the stats route as the behavioral reference; optionally reuse the helper
there only if doing so reduces duplication without changing its response contract.

## Test plan

Model the goal suite on the existing session and period-stat tests. Cover self
without management permission, ordinary-member cross-user denial, authorized
manager cross-user success, target nonmember, permission lookup failure, target
membership lookup failure, cookie sessions, Track and Calendar app-session
actors, and denial for an unrelated app-session audience. Assert admin reads
never run on a rejected request.

## Done criteria

- [ ] Self session and goal reads behave unchanged.
- [ ] Cross-user reads require `manage_time_tracking_requests`.
- [ ] Target membership is still checked after permission authorization.
- [ ] Rejected paths perform no admin data read.
- [ ] Focused tests, auth guard, typecheck, repository gate, build, and whitespace pass.

## STOP conditions

Stop if a legitimate cross-user caller lacks the established management
permission or product owners require a narrower team-scoped reporting role;
resolve that capability model instead of retaining membership-only access.

## Maintenance notes

All future Track endpoints accepting a target user must use the same self-versus-
managed-read boundary before service-role queries.
