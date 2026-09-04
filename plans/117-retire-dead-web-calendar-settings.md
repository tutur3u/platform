# Plan 117: Retire the Dead Web Calendar-Settings Fork

> **Executor instructions:** Delete only the unreferenced Web calendar-settings
> tree after proving Calendar owns the live settings surface. Do not consolidate
> the remaining Calendar and shared-UI implementations in this plan.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/web/src/components/settings/calendar apps/calendar/src/components/settings/calendar apps/calendar/src/components/settings/settings-dialog.tsx packages/ui/src/components/ui/legacy/calendar tmp/agent-coordination`
> Stop on settings imports, ownership, or route drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Web production build disappeared/hung twice during
  Turbopack compilation in the current host session; the reviewed 22-file
  deletion remains in `.worktrees/refactor-web-remove-calendar-settings-fork`
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** architecture
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Web still typechecks 22 self-contained calendar-settings files totaling 6,553
lines, but no Web route/dialog imports their entry points. Calendar renders its
own parallel implementation, so the Web copy is a convincing dead fork where
fixes can land without reaching users.

## Current state

- `apps/web/src/components/settings/calendar/**` contains 22 files; repository-
  wide static import search finds references only within that same tree.
- `apps/calendar/src/components/settings/settings-dialog.tsx:34-35,193-203`
  imports and renders Calendar's live wrapper/content.
- Shared legacy calendars use a separate provider tree under `packages/ui`;
  that live implementation is out of scope.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Recheck dynamic
imports, aliases, tests, story files, and active settings ownership before
deleting. The Forms note mentions only Forms tab removal under Web settings and
does not claim this calendar subtree; stop if ownership has changed.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Import proof | `rg -n 'components/settings/calendar|CalendarSettings(Content|Wrapper)' apps/web/src --glob '!apps/web/src/components/settings/calendar/**'` | no Web consumer |
| Dead tree proof | `test ! -e apps/web/src/components/settings/calendar` | exit 0 |
| Web typecheck/build | `bun run --cwd apps/web type-check && bun run --cwd apps/web build` | both exit 0 |
| Calendar typecheck/build | `bun run --cwd apps/calendar type-check && bun run --cwd apps/calendar build` | both exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- delete `apps/web/src/components/settings/calendar/**`
- `plans/README.md` only for status

Do not edit Calendar settings, shared UI calendar settings, API routes,
translations, or scheduling logic.

## Git workflow

Use branch `refactor/web-remove-calendar-settings-fork` in an isolated worktree
and run `bun setup`. Commit `refactor(web): remove dead calendar settings`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Prove the tree is unreachable

Search all tracked source/config/test files for static, aliased, lazy, dynamic,
and string-built references to the Web tree and its exported component names.
Confirm Calendar's settings dialog renders the satellite-owned copy. Stop on
any real Web consumer.

### Step 2: Delete only the dead fork

Remove the 22 Web files. Do not move code or modify either live implementation;
this is retirement, not consolidation.

### Step 3: Verify both hosts

Run the import/deletion assertions, both app typechecks and real builds,
`bun check`, and whitespace. Inspect `git status` to prove only the deleted tree
and plan status changed.

## Done criteria

- [ ] No tracked Web consumer references the retired settings fork.
- [ ] The entire dead Web tree is absent.
- [ ] Calendar continues to render its own settings implementation unchanged.
- [ ] Web/Calendar typechecks, builds, and repository gates pass.
- [ ] No source outside the deleted tree changed.

## STOP conditions

Stop if any real consumer appears, exact-path ownership appears, deletion
requires editing a live Calendar/shared-UI implementation, or a host gate fails
twice for the same in-scope cause.

## Maintenance notes

Do not replace one dead copy with a new shared abstraction here. Consolidate
the two remaining live settings implementations only after separate behavior
characterization proves the value.
