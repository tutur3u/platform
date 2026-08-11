# Plan 085: Retire the Dead Mobile Task-Description Flag

> **Executor instructions:** Remove the documented rollout flag and unreachable
> disabled UI because rich task-description editing is already hard-enabled.
> Stop if product owners require a real rollback control instead.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/mobile/lib/core/config/env.dart apps/mobile/lib/features/tasks_boards/view/task_board_detail_page_sheet.dart apps/mobile/lib/l10n apps/mobile/test/features/tasks_boards apps/docs/build/devops/mobile-store-deployment.mdx apps/docs/build/devops/secrets-and-configuration.mdx`
> Stop on feature-flag, task-description, localization, or deployment-doc drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** DX / operational correctness
- **Depends on:** product confirmation that rich editing is fully shipped
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Operators are told `MOBILE_TASK_DESCRIPTION_EDITING_ENABLED` controls rollout,
but the app hard-codes the effective check to true. The documented incident
rollback/staging control therefore has no effect, while unreachable UI and copy
continue to imply a state the binary cannot enter.

## Current state

- `apps/mobile/lib/core/config/env.dart` still declares the build define.
- The task-board sheet sets the effective feature check to `true` and retains
  unreachable coming-soon/personal-only branches.
- The mobile deployment guide documents the flag as manually controlled.
- No active note claims these exact mobile task-board/config/docs paths.

## Required skills and preflight

Load `$tuturuuu-mobile-task-board`, `$tuturuuu-ci-docs`, and
`$tuturuuu-agent-coordination`; read `apps/mobile/AGENTS.md`. Obtain an explicit
product/release confirmation that editing is fully shipped. If rollback control
is still required, stop and re-plan this as a wired flag with enabled/disabled
tests rather than deleting it.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Localization generation | `cd apps/mobile && flutter gen-l10n` | generated localization is current |
| Mobile tests | `cd apps/mobile && flutter test test/features/tasks_boards` | task-description behavior passes |
| Mobile analysis | `cd apps/mobile && flutter analyze` | no issues |
| Canonical mobile gate | `bun check:mobile` | format, analysis, and mobile tests pass |
| Docs stale-reference check | `rg -n 'MOBILE_TASK_DESCRIPTION_EDITING_ENABLED' apps/mobile apps/docs` | no output after intentional removal |
| Repository gate | `bun check` | exit 0, or only a documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/mobile/lib/core/config/env.dart`
- `apps/mobile/lib/features/tasks_boards/view/task_board_detail_page_sheet.dart`
- English/Vietnamese ARB files and generated localization only for keys proven
  unused after branch removal
- focused mobile task-board tests
- `apps/docs/build/devops/mobile-store-deployment.mdx`
- `apps/docs/build/devops/secrets-and-configuration.mdx`
- `plans/README.md` only for status

Do not redesign task editing, server persistence, toolbar layout, or unrelated
mobile feature flags.

## Git workflow

Use branch `chore/retire-mobile-description-flag` in an isolated worktree and
run `bun setup`. Commit `chore(mobile): retire task description rollout flag`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Confirm the disposition

Record that rich task-description editing is fully shipped and the flag is not
an operational rollback requirement. Stop if confirmation is unavailable; do
not guess from the hard-coded true value alone.

### Step 2: Remove the ineffective control

Delete the environment getter, hard-coded feature check, and unreachable
disabled/coming-soon branches. Preserve the currently reachable rich-editing
behavior exactly.

### Step 3: Reconcile localization and docs

Remove only English/Vietnamese keys proven unused after the code deletion, run
`flutter gen-l10n`, and delete the flag from every deployment/configuration
guide found by the exact repository search.

### Step 4: Verify release-facing truth

Test the reachable editing flow, run analysis and `bun check`, and prove the
flag name no longer exists in mobile source or docs.

## Done criteria

- [ ] Product/release owners confirm the feature is fully shipped.
- [ ] No inert flag or unreachable disabled UI remains.
- [ ] English/Vietnamese localization and generated files are consistent.
- [ ] Deployment docs no longer advertise a nonexistent control.
- [ ] Focused tests, `bun check:mobile`, repository, and whitespace gates pass.

## STOP conditions

Stop if rollback/staged rollout is still required, a supposedly dead branch is
reachable in tests, localization ownership is active, or a required gate fails
twice.

## Maintenance notes

Operational flags must either control behavior and be tested in both states or
be removed from code and runbooks.
