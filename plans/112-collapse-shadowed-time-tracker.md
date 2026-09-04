# Plan 112: Collapse the Shadowed Time-Tracker Implementation

> **Executor instructions:** Converge the live 2,040-line time tracker and the
> unreachable split directory into one tested module tree. Characterize the
> live behavior first, port only proven parity gaps, preserve existing
> extensionless imports through the directory entry, and delete the duplicate
> implementation.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/tasks-ui/src/calendar/components/time-tracker.tsx packages/tasks-ui/src/calendar/components/time-tracker packages/tasks-ui/src/calendar/components/tasks-sidebar-content.tsx packages/tasks-ui/src/calendar/components/sidebar/calendar-sidebar.tsx tmp/agent-coordination`
> Stop on time-tracker behavior or exact-path ownership drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Tasks production build cannot spawn Turbopack's
  PostCSS worker in the current environment (`EPERM` binding its internal
  port); reviewed uncommitted convergence work remains in
  `.worktrees/refactor-tasks-ui-time-tracker`
- **Priority:** P2
- **Effort:** M
- **Risk:** MED
- **Category:** architecture / test coverage
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Production imports resolve to `time-tracker.tsx`, while a convincing split
implementation under `time-tracker/index.tsx` is unreachable. Fixes can land in
2,572 lines of dead code and never reach users, while the actual component
remains a 2,040-line hotspot far over the repository ceiling.

## Current state

- `tasks-sidebar-content.tsx:22` and `sidebar/calendar-sidebar.tsx:16` import
  `./time-tracker` / `../time-tracker`, which resolves to the sibling file.
- `time-tracker.tsx:107-123` begins the live monolithic implementation.
- `time-tracker/index.tsx:48-72` independently implements the same component
  through split hooks/components, but repository-wide import search finds no
  consumer of that directory.
- Both implementations independently own fetch/start/stop/pause behavior.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Recheck the active
Tasks production note: its enumerated ownership uses old `packages/ui` paths
and does not claim this Calendar tree, but stop if ownership has moved. Preserve
the live copy exactly; localization changes are outside this structural plan.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused behavior tests | `bun --cwd packages/tasks-ui vitest run src/calendar/components/time-tracker/time-tracker.test.tsx src/calendar/components/time-tracker/import-contract.test.ts` | live contracts and single-entry resolution pass |
| Tasks UI tests | `bun run --cwd packages/tasks-ui test` | package suite passes |
| Tasks UI typecheck | `bun run --cwd packages/tasks-ui type-check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Calendar build | `bun run --cwd apps/calendar build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/tasks-ui/src/calendar/components/time-tracker.tsx`
- `packages/tasks-ui/src/calendar/components/time-tracker/**`
- the two importing sidebar components only if an explicit entry path is needed
- focused behavior/import-contract tests
- `plans/README.md` only for status

Do not change timer API contracts, server transitions, task creation semantics,
history product scope, or unrelated Calendar sidebar behavior.

## Git workflow

Use branch `refactor/tasks-ui-time-tracker` in an isolated worktree and run
`bun setup`. Commit `refactor(tasks-ui): collapse duplicate time tracker`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize the live component

Create focused tests for initial fetch, dialog open/close, elapsed-time tick,
task/manual starts, stop, pause, resume, edit/delete, task creation, keyboard
shortcut, query invalidation, and failure toasts. Record which behaviors are
missing or divergent in the split tree before changing import resolution.

### Step 2: Port parity gaps into bounded modules

Use the split directory as the destination. Port only behavior proven by Step
1, split any substantially edited component above 700 LOC, and keep request and
query-key contracts unchanged. Preserve the live user-facing copy exactly;
localization is a separate product change.

### Step 3: Make one implementation resolvable

Replace the monolithic implementation only after parity tests pass. Retain
`time-tracker.tsx` unconditionally as a tiny explicit re-export from
`./time-tracker/index`—never `./time-tracker`, which self-resolves—because the
package wildcard export advertises the `.tsx` subpath. Add an import-contract
test that fails when the compatibility file contains component logic and prove
both current relative imports and
`@tuturuuu/tasks-ui/calendar/components/time-tracker` resolve the directory
implementation through that file.

### Step 4: Verify both hosts

Run focused/package tests and typecheck, then build both Tasks and Calendar
before `bun check`.

## Done criteria

- [ ] Exactly one time-tracker implementation owns behavior.
- [ ] Existing Tasks and Calendar imports resolve to that implementation.
- [ ] The advertised package subpath resolves through the explicit thin re-export.
- [ ] Live mutation, timing, shortcut, dialog, and error contracts are covered.
- [ ] No substantially edited source module exceeds 700 LOC.
- [ ] Focused/package tests, typecheck, both app builds, and repository gates pass.

## STOP conditions

Stop if exact-path ownership appears, live and split behaviors cannot be
reconciled without a product decision, an existing API contract must change,
or either host build fails twice for the same in-scope cause.

## Maintenance notes

Avoid same-basename file/directory implementations. Keep the public import
stable while the internal tree remains explicit and testable.
