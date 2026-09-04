# Plan 136: Retire Dormant Calendar Settings State and Localize the Live Surface

> **Executor instructions:** Remove only the unreachable legacy settings state
> and panels inside the Calendar satellite, preserve the two live settings
> sections, and move all reachable Calendar-owned copy into English/Vietnamese
> messages.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/calendar/src/components/settings/settings-dialog.tsx apps/calendar/src/components/settings/settings-dialog.test.tsx apps/calendar/src/components/settings/calendar apps/calendar/messages/en.json apps/calendar/messages/vi.json tmp/agent-coordination`
> Stop on reachability, settings navigation, message, ownership, or persistence
> drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Calendar production build failed twice in the
  current environment (Google Fonts network restriction, then Turbopack CSS
  worker process/port `EPERM`); the reviewed implementation, passing focused
  tests, i18n gates, typecheck, and whitespace remains in
  `.worktrees/refactor-calendar-settings-state`
- **Priority:** P2
- **Effort:** M
- **Risk:** LOW
- **Category:** architecture / i18n
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Calendar renders only Hours, workspace timezone/first-day preferences, and
Category Colors, yet its live tree carries five unreachable panels plus a
legacy provider/save wrapper whose dormant state owns those panels. The active
surface also contains hard-coded English copy. Removing roughly two thousand
dead lines makes the satellite ownership unambiguous and restores the required
bilingual contract without changing stored settings.

## Current state

- `settings-dialog.tsx:193-204` renders `CalendarSettingsContent` only for
  `calendar_hours` and `calendar_colors`, wrapped in
  `CalendarSettingsWrapper`.
- `calendar-settings-content.tsx` passes `hideActions` for every live layout;
  neither Hours, Category Colors, nor Workspace Preferences calls the local
  `useCalendarSettings` context.
- `settings-context.tsx` imports defaults/types from app-local Appearance,
  Notifications, Smart Scheduling, Task, and Timezone panels. Repository-wide
  symbol search finds no rendered consumer of those five components.
- `calendar-settings-wrapper.tsx` contains a raw PATCH and save toast, but live
  layouts hide its save actions and no reachable child updates its state.
- Reachable hard-coded copy includes section headings/descriptions, category
  guidance/placeholders, Hours overview/empty labels, and copy/remove actions in
  `time-range-picker.tsx`.
- Plan 117 removes only the dead Web fork and explicitly leaves this Calendar
  satellite tree out of scope; this plan does not duplicate that work.

## Required skills and preflight

Load `$tuturuuu-platform`, `$vercel-react-best-practices`, and
`$tuturuuu-agent-coordination`. Re-run exact import/symbol searches before
deleting anything. Do not infer deadness from a hidden tab alone; prove there is
no static, dynamic, wildcard-export, or test consumer.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Reachability | `rg -n 'AppearanceSettings|NotificationSettings|SmartSchedulingSettings|TaskSettings|TimezoneSettings|CalendarSettingsProvider|CalendarSettingsWrapper|useCalendarSettings' apps/calendar/src --glob '*.ts' --glob '*.tsx'` | only intended shared UI names remain; deleted app-local symbols have no match |
| Focused UI | `bun --cwd apps/calendar vitest run src/components/settings/settings-dialog.test.tsx src/components/settings/calendar/calendar-settings-content.test.tsx` | live navigation/render/localization cases pass |
| i18n | `bun i18n:sort && bun i18n:key-parity && bun i18n:namespace-check` | exit 0 |
| Calendar typecheck | `bun run --cwd apps/calendar type-check` | exit 0 |
| Calendar build | `bun run --cwd apps/calendar build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** Calendar settings dialog/test; Calendar-owned settings tree and a
new focused content test; Calendar en/vi messages; README status.

**Out of scope:** shared `@tuturuuu/ui` settings, Plan 117's Web deletion,
calendar APIs/schema, saved hours/categories/preferences behavior, new settings
features, navigation tabs, design redesign, and package dependencies.

## Git workflow

Use `refactor/calendar-settings-state`, run `bun setup`, and commit
`refactor(calendar): remove dormant settings state`. Claim/release the commit
window; do not push unless instructed.

## Steps

### Step 1: Prove the live and dead graph

Add a focused test that renders the Hours and Colors sections and asserts their
localized headings. Inventory imports and package exports. The deletion set is
exactly the app-local `appearance-settings.tsx`, `notification-settings.tsx`,
`smart-scheduling-settings.tsx`, `task-settings.tsx`,
`timezone-settings.tsx`, `settings-context.tsx`, and
`calendar-settings-wrapper.tsx`, unless drift proves a real consumer.

**Verify:** import searches show the five panels are referenced only by the
legacy context and that context/wrapper are used only by the live dialog/layout.
If any independent consumer appears, STOP rather than expanding scope.

### Step 2: Remove the dormant provider and panels

Render `CalendarSettingsContent` directly in the dialog. Make
`CalendarSettingsLayout` presentation-only and delete its hidden save/reset
branch. Delete the seven proven-dead files. Preserve Hours, Colors, Preferences,
time-range, overview, and color-picker behavior.

**Verify:** reachability command has no deleted app-local symbol match and the
focused dialog/content tests pass.

### Step 3: Localize every reachable Calendar-owned settings string

Add one scoped message namespace in both Calendar bundles and use
`useTranslations` through the live content, Hours/overview/time-range, and
Category Colors components. Include visible labels, descriptions,
placeholders, confirmation copy, and screen-reader text. Time-axis literals
such as `12am` must use the existing time-format helper or a locale-aware
formatter rather than duplicated translation keys.

**Verify:** a focused source assertion scans the reachable file list for the
known retired English literals, both locale render cases pass, and all i18n
gates pass.

### Step 4: Run all gates

Run focused tests, i18n, Calendar typecheck/build, `bun check`, and whitespace.
Confirm status contains only scoped Calendar source/messages/tests plus README.

## Done criteria

- [ ] Seven proven-dormant provider/panel files are absent.
- [ ] Hours, timezone/first-day, and Category Colors remain reachable.
- [ ] No reachable Calendar-owned settings copy is hard-coded English.
- [ ] No raw PATCH from the deleted dormant wrapper remains.
- [ ] Focused, i18n, typecheck, build, repository, and whitespace gates pass.

## STOP conditions

Stop if a deleted candidate has a real consumer/export, the wrapper currently
persists a reachable edit, new product settings are required, localization
would push `time-range-picker.tsx` above 700 lines rather than extracting a
helper, another owner edits the subtree/messages, or a gate fails twice.

## Maintenance notes

Future Calendar settings must use the registered Settings dialog and explicit
typed persistence, not revive a broad client state object with unreachable
panels or raw client fetches.
