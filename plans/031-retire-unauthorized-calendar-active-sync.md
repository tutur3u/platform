# Plan 031: Retire the Unauthorized Calendar Active-Sync Path

> **Executor instructions:** Remove the legacy body-workspace active-sync
> endpoint and route every supported manual trigger through the canonical
> workspace-scoped sync contract. Do not preserve its admin-backed behavior
> behind authentication alone. Run every gate and update this plan's row in
> `plans/README.md` when complete.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/calendar/src/app/api/v1/calendar/auth/active-sync apps/calendar/src/app/api/v1/workspaces apps/infrastructure/src/app/'[locale]'/'(dashboard)'/'[wsId]'/calendar-sync apps/infrastructure/next.config.ts`
> Stop on material sync-route, satellite-auth, or Infrastructure ownership
> drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Calendar production build repeatedly fails in the
  current execution environment with Turbopack `EPERM` while creating its CSS
  worker process/internal port; reviewed uncommitted work remains in
  `.worktrees/fix-calendar-active-sync-boundary`
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / Correctness / API migration
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The legacy endpoint accepts a workspace in the body, proves only that some user
is authenticated, then uses an admin client to enumerate connections and mutate
calendar state for that workspace. Its only UI caller lives in Infrastructure,
where the relative URL falls through to Web rather than Calendar, so the button
is broken while the unsafe endpoint remains reachable directly.

## Current state

- `apps/calendar/src/app/api/v1/calendar/auth/active-sync/route.ts:41-64`
  authenticates but never verifies the actor belongs to the submitted
  workspace; normalization is not bound to the request client.
- Lines 95-237 create admin state, load every enabled workspace connection and
  encrypted event id, then sync those calendars under the caller-selected id.
- `apps/calendar/src/app/api/v1/workspaces/[wsId]/calendar/sync/route.ts:67-100`
  already has the canonical membership boundary; it also owns locks, cooldown,
  provider behavior, and focused tests.
- `apps/infrastructure/.../sync-trigger-button.tsx:25-35` calls the legacy path
  relatively. `apps/infrastructure/next.config.ts:26-30` sends unmatched API
  paths to Web, which has no matching implementation.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$vercel-react-best-practices`. Treat Calendar as the mutation owner and the
Infrastructure replacement as navigation only.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Sync route tests | `bun --cwd apps/calendar vitest run 'src/app/api/v1/workspaces/[wsId]/calendar/sync/route.test.ts'` | auth, lock, and trigger cases pass |
| Infrastructure focused test | `bun --cwd apps/infrastructure vitest run 'src/app/[locale]/(dashboard)/[wsId]/calendar-sync/_components/sync-trigger-button.test.tsx'` | Calendar deep-link contract passes |
| Typechecks | `bun run --cwd apps/calendar type-check && bun run --cwd apps/infrastructure type-check` | both exit 0 |
| Repository gate | `bun check` | exit 0 |
| App builds | `bun run --cwd apps/calendar build && bun run --cwd apps/infrastructure build` | both exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Delete `apps/calendar/src/app/api/v1/calendar/auth/active-sync/route.ts`
- Canonical Calendar sync route/tests only for compatibility gaps proven by
  characterization
- Infrastructure sync-trigger UI and its new focused test

Do not redesign provider synchronization, change cron behavior, or solve the
separate bounded-concurrency backlog item in this plan.

## Git workflow

- Branch: `fix/calendar-active-sync-boundary` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(calendar): retire unsafe active sync route`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Characterize the supported manual-sync contract

Compare legacy response fields/date windows with the canonical workspace route.
Add tests proving the canonical route rejects anonymous, wrong-target,
nonmember, and membership-lookup-failure callers before admin work. Preserve
only behavior required by a real caller.

### Step 2: Choose an explicit Infrastructure product seam

Remove the broken in-place mutation. Replace it with a safe deep-link to the
authorized Calendar workspace using the canonical app URL/cross-app navigation
helper; label it as opening Calendar, not as completing a sync. Do not invent a
query-triggered mutation or forward an Infra-target app session to Calendar.

### Step 3: Remove the legacy route

Move any uniquely required compatibility behavior into the canonical route,
then delete active-sync. `rg` must show no live caller or documentation. Ensure
all workspace ids originate from the URL/server contract and are authorized
before admin queries or provider calls.

### Step 4: Test routing and run gates

Cover the actual Infrastructure hostname/rewrite behavior plus Calendar
membership, permission, lock, cooldown, and failure responses. Run both real
app builds because route/rewrite behavior is not established by `bun check`.

## Test plan

- Extend the canonical Calendar sync route test for anonymous, wrong-target,
  nonmember, lookup failure, lock/cooldown, and success behavior.
- Add a focused Infrastructure routing/UI test for the selected product seam.
- Add a negative source assertion that the legacy route/call string is absent.

## Done criteria

- [ ] No body-selected, membership-free active-sync endpoint remains.
- [ ] Every remaining manual sync entry point reaches the canonical workspace
      authorization and lock/cooldown path.
- [ ] Infrastructure no longer calls a route that its rewrite sends to Web.
- [ ] Cross-app authentication does not broaden either satellite audience.
- [ ] Focused tests, typechecks, `bun check`, both builds, and whitespace pass.

## STOP conditions

Stop if a documented product/operator requirement proves Infrastructure must
retain an in-place privileged trigger or if a server-to-server credential would
be required. Define that separate permission and credential lifecycle before
implementation.

## Maintenance notes

This plan supersedes only the authorization/routing portion of the deferred
active-sync item. Bounded concurrency, cancellation, and provider retry remain
a separate performance plan.
