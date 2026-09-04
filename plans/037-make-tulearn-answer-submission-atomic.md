# Plan 037: Make Tulearn Answer Submission Atomic

> **Executor instructions:** Put answer acceptance and attempt submission behind
> database state transitions that cannot interleave into a submitted attempt
> with ungraded or mismatched answers. Preserve idempotent repeat submission and
> expiry auto-submit.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/learn/src/app/api/v1/workspaces/'[wsId]'/tulearn/courses/'[courseId]'/tests packages/education-core/src/tulearn/test-session.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on material attempt-state, scoring, or answer-schema drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** Bug / Concurrency / Assessment integrity
- **Depends on:** Plan 036; generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution remains blocked until Plan 036 is DONE and the active Mail/Zalo lanes
release generated database type ownership. The education extraction note is
canonical `done` and is not an additional blocker.

## Why this matters

Saving checks `submitted_at` and later upserts independently, while submission
reads answers, writes grades, and only then marks the attempt submitted. A
concurrent save can overwrite a graded row with null grading fields after the
attempt is finalized, leaving the score and stored answers inconsistent while
both requests report success.

## Current state

- `save-answer/route.ts:83-149` reads the attempt state, separately verifies the
  quiz, then unconditionally upserts answer content with `is_correct` and
  `score_awarded` reset to null.
- `submit/route.ts:76-98` independently reads the attempt before calling
  `submitTestAttemptInternal`.
- `packages/education-core/src/tulearn/test-session.ts:103-283` checks
  `submitted_at`, reads an answer snapshot, computes grades in application code,
  upserts graded answers, then updates the attempt in separate commits.
- Expiry handling in attempt/save routes invokes the same helper, so the
  transaction design must cover manual, automatic, and repeated submission.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$supabase-postgres-best-practices`. Complete Plan 036 first so access and state
integrity are not implemented against two competing route shapes.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Database reset | `bun sb:reset` | migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | all pgTAP tests pass |
| Type generation | `bun sb:typegen` | generated types match the local schema |
| Core tests | `bun --cwd packages/education-core vitest run 'src/tulearn/test-session.test.ts'` | submission behavior passes |
| Learn tests | `bun --cwd apps/learn vitest run 'src/app/api/v1/workspaces/[wsId]/tulearn/courses/[courseId]/tests/test-session.route.test.ts'` | interleaving cases pass |
| Learn typecheck | `bun run --cwd apps/learn type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Learn build | `bun run --cwd apps/learn build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- One additive migration providing conditional answer-save and atomic attempt
  submission boundaries, database tests, and regenerated DB types
- `packages/education-core/src/tulearn/test-session.ts` plus a focused test
- Save-answer, submit, and expiry call sites plus a focused route test

Do not change grading formulas, score publication, quiz authoring, or attempt
retake policy.

## Git workflow

- Branch: `fix/tulearn-atomic-submission` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(learn): make test submission atomic`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Specify state and idempotency

Add deterministic concurrency fixtures for save versus manual submit, save
versus expiry submit, two simultaneous submits, a failure during grading, and a
repeat submit after success. Define the winning response and ensure repeat
submission returns the one committed result.

### Step 2: Add database transition boundaries

Create an additive, locked/conditional database operation for answer saves that
fails once submission is claimed or complete. Create an atomic submission
operation that locks/claims one unsubmitted attempt, uses one stable answer
snapshot, writes all graded answers, and finalizes score/submitted time in one
transaction. If grading must remain in TypeScript, use a claim token/state and a
transactional finalize operation that prevents later saves and rolls back or
releases failed claims safely. Put privileged functions in `private` and revoke
execution from `PUBLIC`, `anon`, and `authenticated`; validate the actor,
workspace, test, attempt, and answer identifiers inside the transaction rather
than trusting route-supplied parameters.

### Step 3: Switch every caller and remove check-then-act writes

Route manual submission and expiry auto-submit through the same idempotent
service. Route answer saves through the conditional operation. Map expected
state conflicts to stable client responses; do not return a generic 500 for an
already-submitted attempt.

## Test plan

- Add `apps/database/supabase/tests/tulearn-test-submission.sql` with transaction,
  rollback, and state-guard assertions.
- Add `packages/education-core/src/tulearn/test-session.test.ts` and the named
  Learn route test with controlled promise barriers to prove responses cannot
  outrun the winning transition.
- Assert no submitted attempt contains null grading for objectively graded
  answers and its total equals the committed answer grades.

## Done criteria

- [ ] Saves cannot commit after submission is claimed or completed.
- [ ] Graded answers and final attempt score commit atomically.
- [ ] Transaction functions are server-only and validate all affected identities.
- [ ] Manual, expiry, double-submit, retry, and rollback cases are deterministic.
- [ ] DB reset/typegen, tests, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if production contains submitted attempts with inconsistent answer grades
and no operator-approved repair policy exists, or if safe atomicity requires a
new asynchronous grading product contract. Do not silently rewrite history.

## Maintenance notes

Keep scoring-version or manual-grading extensions inside the same explicit
attempt state machine; do not reintroduce route-level check-then-act guards.
