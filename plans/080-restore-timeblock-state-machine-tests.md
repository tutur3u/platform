# Plan 080: Restore Timeblock State Tests and Fix Single-Cell Removal

> **Executor instructions:** Replace all 25 static skips with deterministic
> assertions beside the shared utility. Fix the proven single-cell removal
> expansion without changing the provider contract. Decide interval/timezone
> semantics from current product behavior; do not blindly bless stale
> expectations.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/web/src/__tests__/timeblock-helper.test.tsx packages/utils/src/timeblock-helper.ts packages/utils/src/timeblock-helper.test.ts packages/ui/src/hooks/time-blocking-provider.tsx`
> Stop on utility behavior or scheduling-contract drift.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `d66675d9d6c2be5591f3c98e89b47db453c11d06`
  on branch `fix/timeblock-state-machine-removal`; 42 focused tests, Utils
  typecheck, no-skip ratchet, `bun check`, whitespace, and hooks passed
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Correctness / Test coverage / scheduling
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Twenty-five tests for duration generation, merging, reverse selection,
multi-day ranges, overlaps, and removal splitting are statically skipped. These
are the exact shared algorithms used by the live scheduling editor, so green
CI currently says nothing about most of its state-machine boundary behavior.

## Current state

- `apps/web/src/__tests__/timeblock-helper.test.tsx:364-1285` contains 25
  `test.skip` cases across the three core mutation families.
- `packages/utils/src/timeblock-helper.ts:79-325` implements the shared
  generation, merge, and removal logic.
- `packages/ui/src/hooks/time-blocking-provider.tsx:408-449` calls
  `addTimeblocks` and `removeTimeblocks` for live edits.
- The tests live in Web even though the implementation belongs to
  `@tuturuuu/utils`, which makes their ownership and canonical execution weak.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Confirm no exact
test/utility owner appeared, run `git status --short`, and record the current
timezone used by the existing test setup before changing expectations.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Shared utility tests | `bun run --cwd packages/utils test -- src/timeblock-helper.test.ts` | all state-machine cases execute; zero skips |
| Remaining Web test | `bun run --cwd apps/web test -- src/__tests__/timeblock-helper.test.tsx` | retained Web-specific cases pass; zero duplicated skipped suites |
| Utility types | `bun run --cwd packages/utils type-check` | exit 0 |
| Repository gate | `bun check` | exit 0, or only a documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/utils/src/timeblock-helper.test.ts` (create)
- `apps/web/src/__tests__/timeblock-helper.test.tsx` only to move/remove the
  corresponding shared-utility suites
- `packages/utils/src/timeblock-helper.ts` only when an executable case proves
  the now-established bug: one selected date is one 15-minute cell, and each
  date in the more-than-two individual-removal branch is also one cell. Pass
  the selected instant as the inclusive endpoint to the range helper; do not
  pre-add a second 15-minute quantum before that helper applies its existing
  inclusive-end conversion
- `plans/README.md` only for status

Do not edit the production provider hook, translations, pages, API routes, or
time-block persistence. The two-date selection continues to represent an
inclusive start/end selection and is not part of the single-cell fix.

## Git workflow

Use branch `fix/restore-timeblock-state-machine` in an isolated worktree and
run `bun setup`. Commit `fix(calendar): restore timeblock state coverage`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Define the temporal contract

Run the skipped cases individually under a fixed timezone and fake clock. From
current UI behavior and persisted `Timeblock` shape, document half-open versus
inclusive endpoints, the existing 15-minute selection increment, reverse-order
normalization, date offset handling, and DST behavior. Do not use the current
expected arrays as the sole authority.

### Step 2: Move shared tests to the owning package

Create `packages/utils/src/timeblock-helper.test.ts` and move the coherent
utility suites and fixtures from Web. Keep any genuinely Web-specific setup in
the Web file. Replace every static skip with an executable assertion or delete
it only when a named equivalent case covers the same branch.

### Step 3: Fix the proven single-cell expansion and resolve failures

Classify each failure as stale test, timezone nondeterminism, or production
bug. Fix fixture/time control for the first two. For `dates.length === 1` and
the more-than-two per-date loop, remove the pre-added 15-minute end so the
existing inclusive-end range helper removes exactly one cell. Add explicit
08:15–08:30 assertions for both shapes. Do not turn any other surprising
behavior into a new snapshot.

### Step 4: Ratchet against renewed skips

Add a focused assertion or source check in the owning test file that ensures
these suites contain no `.skip`/`.todo`. Run both focused suites, utility
typecheck, `bun check`, and whitespace validation.

## Test plan

- Same-day, multi-day, reverse-order, positive/negative offset, and DST-adjacent
  duration generation.
- Empty, adjacent, overlapping, partially overlapping, and reverse-order merges.
- First/last/middle/full removals across one and multiple days and blocks.
- Fixed timezone/clock produces identical results on developer and CI hosts.
- The restored suite has 25 or more equivalent executing cases and zero skips.

## Done criteria

- [ ] Every formerly skipped behavior is covered by an executing assertion.
- [ ] Shared tests live beside `packages/utils` and are deterministic.
- [ ] Single-date and individual multi-date removals delete exactly one
      15-minute cell per selected instant.
- [ ] Both suites, utility types, `bun check`, and whitespace pass.
- [ ] No production UI/provider file changed.

## STOP conditions

Stop if product interval/DST semantics cannot be established, another
production bug outside the explicit single-cell fix is revealed, an active
owner claims the files, or a required gate fails twice.

## Maintenance notes

Skipped state-machine cases are invisible risk. Keep temporal semantics explicit
and locate reusable utility tests in the package that owns the algorithm.
