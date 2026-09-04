# Plan 049: Repair UI Time-Tracker Exports

> **Executor instructions:** Make the published `@tuturuuu/ui` export map match
> real files, then add a package-readiness regression check without inventing a
> new public API.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/ui/package.json packages/ui/src/components/ui/calendar-app packages/ui/src/components/ui/time-tracker scripts package.json turbo.json`
> Stop if the time-tracker implementation or publication tooling moved.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `b1b7c71fefcd1ed59c73abc1749d49ef6edf3903`
  on branch `fix/ui-time-tracker-exports`; focused validator tests, all 816 UI
  tests, UI typecheck, `bun check`, whitespace, and hooks passed
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** Dependencies / Package publishing
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The public UI package advertises time-tracker imports whose target directory is
absent. Published consumers can pass installation and then fail module
resolution at import time.

## Current state

- `packages/ui/package.json` exports
  `./calendar-app/components/time-tracker` and its wildcard to
  `src/components/ui/calendar-app/components/time-tracker/**`.
- That target directory does not exist. The only similarly named local surface
  is `src/components/ui/time-tracker/types.ts`; it is not evidence that the
  advertised component API should be redirected there.
- No workspace currently consumes the broken exports, so ordinary typechecks do
  not detect them.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-platform`, and
`$tuturuuu-agent-coordination`. Inspect package publication history and Git
history for the retired target. Because dependency manifests must not be edited
manually for dependency changes, note that this plan changes only `exports`, not
dependency declarations.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Export check | `node --test scripts/check-package-exports.test.js` | all fixtures pass |
| UI tests | `bun --cwd packages/ui test` | exit 0 |
| UI typecheck | `bun --filter @tuturuuu/ui type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/ui/package.json`
- A focused read-only export-map checker and test under `scripts/`
- Root script/check registration only where required to enroll the checker

The new validator also proves
`./calendar-app/components/sidebar/*` points at a directory deleted by the same
retirement commit as the time-tracker tree. Remove that sibling stale wildcard
in this plan. Do not recreate a component from guesswork or alter any other
unrelated exports.

## Git workflow

- Branch: `fix/ui-time-tracker-exports` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(ui): repair time tracker exports`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Resolve the intended contract

Use Git history and release metadata to determine whether the calendar-app
time-tracker was retired or accidentally moved. If retired, remove the two dead
time-tracker exports plus the stale `./calendar-app/components/sidebar/*`
wildcard deleted by the same historical change. If implementation exists under
a deliberate new path, restore a thin,
tested compatibility entry point rather than redirecting to the unrelated
types-only directory.

### Step 2: Add package export validation

Add a deterministic read-only checker for versioned workspace packages. Resolve
literal targets and wildcard base directories, understand conditional export
objects, and report package plus export key. Add fixtures for valid files,
wildcards, conditional entries, and missing targets.

### Step 3: Enroll the focused guard

Run it from the narrow package-readiness or canonical script-test gate without
duplicating existing validation. Confirm it reports the current defect before
the fix and passes after it.

## Done criteria

- [ ] Every advertised UI export resolves to an intentional source surface.
- [ ] No speculative time-tracker API is introduced.
- [ ] A focused guard detects missing literal and wildcard targets.
- [ ] Tests, typecheck, `bun check`, and whitespace pass.

## STOP conditions

Stop if release history shows external consumers require the missing API but
the intended implementation cannot be recovered, or active tooling ownership
overlaps the canonical check registration.

## Maintenance notes

Run export-map validation before publishing every versioned package. File
existence is necessary; public API semantics still require review.
