# Plan 120: Single-Source Calendar Preference Resolution

> **Executor instructions:** Characterize the current locale, timezone, and
> preference precedence once in `@tuturuuu/utils`, then replace the Calendar and
> UI copies with thin compatibility re-exports or canonical imports.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/calendar/src/lib/calendar-settings-resolver.ts packages/ui/src/lib/calendar-settings-resolver.ts packages/utils/src/calendar-settings-resolver.ts apps/calendar/src/components/settings/calendar packages/ui/src/components/ui/calendar-app tmp/agent-coordination`
> Stop if the three implementations are no longer behaviorally identical or an
> exact-path owner appears.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `b53b925a2ae570bfbc178e91dc8b3dbcafe23a08`
  on branch `refactor/calendar-preference-resolver`; 26 focused/integration
  tests, three typechecks, three app builds, `bun check`, whitespace, and hooks passed
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** architecture
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Three byte-identical 200-line resolvers independently define locale heuristics,
timezone fallback, and user/workspace precedence. A one-copy fix can make
Calendar, embedded calendar UI, Contacts, and Platform interpret the same saved
preferences differently.

## Current state

- `apps/calendar/src/lib/calendar-settings-resolver.ts`,
  `packages/ui/src/lib/calendar-settings-resolver.ts`, and
  `packages/utils/src/calendar-settings-resolver.ts` are byte-identical.
- Calendar settings import the app copy; shared Calendar UI imports the UI copy.
- Web and Contacts already import the Utils version, making it the practical
  canonical contract.
- Calendar and UI already depend on `@tuturuuu/utils`; no dependency or lockfile
  edit is required. No focused resolver test protects the current behavior.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. No active note
claims these exact paths; recheck before editing. This plan is separate from
Plan 108's server scheduling core and must not expand into scheduling logic.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Canonical resolver | `bun run --cwd packages/utils test -- src/calendar-settings-resolver.test.ts` | locale/precedence matrix passes |
| Calendar consumers | `bun --cwd apps/calendar vitest run src/components/settings/calendar/workspace-calendar-preferences.test.tsx` | canonical resolver integration passes |
| Shared UI consumers | `bun --cwd packages/ui vitest run src/components/ui/calendar-app/hooks/use-calendar-settings.test.ts` | canonical resolver integration passes |
| Typechecks | `bun run --cwd packages/utils type-check && bun run --cwd packages/ui type-check && bun run --cwd apps/calendar type-check` | exit 0 |
| Builds | `bun run --cwd apps/calendar build && bun run --cwd apps/web build && bun run --cwd apps/contacts build` | live hosts compile |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- the three resolver files and one new canonical Utils test
- the named Calendar and shared-UI consumers plus focused tests
- thin re-exports required to preserve current local import paths
- `plans/README.md` only for status

Do not change stored settings, API routes, translations, scheduling, Calendar
provider sync, or preference UX.

## Git workflow

Use branch `refactor/calendar-preference-resolver` in an isolated worktree and
run `bun setup`. Commit `refactor(calendar): single-source preference resolution`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Freeze the canonical behavior

Add table-driven Utils tests for explicit user values, workspace fallbacks,
locale-derived defaults, supported/unsupported locale tags, empty/null values,
timezone precedence, and serialization/conversion helpers. Use fixed timezone
and locale inputs; do not derive expectations from the duplicate copies.

### Step 2: Preserve import compatibility

Keep `packages/utils/src/calendar-settings-resolver.ts` canonical. Replace the
Calendar and UI files with thin re-exports from
`@tuturuuu/utils/calendar-settings-resolver`, or update all internal imports and
retain thin re-exports where package/app paths may be consumed. Do not create a
dependency cycle.

### Step 3: Prove live-host integration

Add or extend focused Calendar/UI tests to prove saved user values override
workspace values and locale fallback remains identical. Typecheck all three
workspaces and build Calendar plus the existing Web/Contacts hosts of the
canonical resolver.

### Step 4: Run repository gates

Run focused tests, typechecks, builds, `bun check`, and whitespace.

## Done criteria

- [ ] One implementation defines calendar preference resolution.
- [ ] Existing Calendar/UI import paths remain valid or all consumers migrate safely.
- [ ] Locale, timezone, null, and precedence behavior is characterized and unchanged.
- [ ] Focused tests, typechecks, host builds, and repository gates pass.

## STOP conditions

Stop if the copies have diverged, canonicalization creates a dependency cycle,
an external export depends on a removed path, exact ownership appears, or an
in-scope gate fails twice.

## Maintenance notes

Preference precedence is domain logic. Keep it in one tested pure module rather
than copying it into each rendering surface.
