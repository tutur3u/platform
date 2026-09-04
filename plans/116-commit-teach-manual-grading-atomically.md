# Plan 116: Commit Teach Manual Grading and Attempt Totals Together

> **Executor instructions:** Move one answer's manual grade and the attempt
> total recomputation into a private, service-role-only database transaction.
> Preserve Teach authorization, score bounds, nullable-score semantics, and the
> current response shape.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/teach/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/submissions/[attemptId]' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`
> Stop on grading, schema, generated-type, or ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** correctness / tests
- **Depends on:** generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Manual grading commits the answer first, then separately reads every answer and
updates the stored attempt total. A later failure leaves contradictory academic
records; concurrent graders can calculate totals from different snapshots.

## Current state

- `submissions/[attemptId]/route.ts:330-351` updates the answer through the
  admin client.
- Lines 353-370 read all awarded scores, reduce them in JavaScript, and update
  `course_test_attempts.score` separately.
- Migration `20260623151300_add_course_test_attempts.sql:13-40` stores answer
  and attempt scores independently with no transactional reconciliation rule.
- The nearby AI-feedback test is the route-mock exemplar; there is no manual
  PATCH suite.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. The top-level education note has a noncanonical
done-with-suffix status and broad Teach API ownership; generated database types
also have active owners. Do not execute without explicit transfers.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| New migration | `bun sb:new commit_teach_manual_grading_atomically` | one uniquely named additive migration |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | grading transaction tests pass |
| Local apply | `bun sb:up` | migration applies locally |
| Type generation | `bun sb:typegen` | generated types include the RPC and no unrelated drift |
| Route tests | `bun --cwd apps/teach vitest run 'src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/submissions/[attemptId]/route.test.ts'` | manual grading suite passes |
| Teach typecheck/build | `bun run --cwd apps/teach type-check && bun run --cwd apps/teach build` | both exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- the manual submission route and a colocated new test
- one additive migration and focused pgTAP test
- generated Supabase types after exclusive ownership is obtained
- `plans/README.md` only for status

Do not change learner submission, AI feedback, course/test schemas, grading
permissions, maximum-score rules, or response fields.

## Git workflow

Use branch `fix/teach-manual-grading-transaction` in an isolated worktree and
run `bun setup`. Commit `fix(teach): commit manual grading atomically`. Claim
the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Specify the private RPC contract

Create `public.commit_teach_manual_grade(p_attempt_id uuid, p_test_id uuid,
p_quiz_id uuid, p_feedback text, p_is_correct boolean, p_score_awarded real,
p_score_supplied boolean) returns jsonb`. The boolean preserves the distinction
between an omitted score and an explicit null. Return exactly
`{ "answer": <the current answer projection>, "totalScore": <number|null> }`.
Make it `SECURITY DEFINER` with an explicit safe search path, revoke execution
from `PUBLIC`, `anon`, and `authenticated`, and grant only `service_role`. The
route remains responsible for actor permission and course scoping; the function
defensively revalidates attempt/test/quiz relationships and score bounds.

### Step 2: Lock and update one authoritative attempt

Inside one transaction, lock the attempt scoped to `attemptId + testId`, prove
the quiz belongs to the test, validate the maximum score defensively, update
the answer, recompute `sum(coalesce(score_awarded, 0))`, update the attempt, and
return the answer plus total. Feedback-only updates must not change score state.

### Step 3: Route grading through the transaction

Keep current Zod, Teach access, course/test/quiz, and status behavior. Replace
only the split answer/read/attempt writes with the typed RPC and preserve
`{ success: true, answer }`.

### Step 4: Prove rollback and concurrency

Add pgTAP coverage for downstream failure rollback, null/zero/max/over-max
scores, wrong attempt/test/quiz, feedback-only updates, retry, and two graders
updating different answers concurrently. Route tests must cover RPC failure and
assert no second admin write occurs. Put database coverage in
`apps/database/supabase/tests/teach-manual-grading-atomicity.sql`. For the real
race, use the installed `extensions.dblink` async helpers: create committed,
uniquely named course/test/attempt/answer fixtures through a dedicated setup
connection; open two independent worker connections with `dblink_connect`;
issue both grade RPC calls with `dblink_send_query` before collecting either via
`dblink_get_result`; assert the final attempt total equals the authoritative
answer sum; then delete every committed fixture through a dedicated cleanup
connection. Wrap normal and assertion-failure paths so fixture cleanup is
attempted and fail the suite if any uniquely named row remains. Use only the
local database connection information already available to the pgTAP harness;
never invent or commit credentials. The ordinary route Vitest is response and
call-boundary coverage, not the concurrency proof.

### Step 5: Apply and run all gates

Apply locally, regenerate types under exclusive ownership, then run database,
route, Teach build/typecheck, repository, and whitespace gates.

## Done criteria

- [ ] Answer grade and attempt total commit together or not at all.
- [ ] Concurrent grading leaves total equal to authoritative answer rows.
- [ ] The RPC cannot be invoked by ordinary database callers.
- [ ] Existing permission, score validation, nullable, and response contracts remain.
- [ ] Database, route, typegen, Teach, and repository gates pass.

## STOP conditions

Stop without both ownership transfers, if historical totals use a different
business rule, if the function would be callable by untrusted roles, if the
local pgTAP environment cannot open two `dblink` connections using its existing
local connection configuration, or an in-scope gate fails twice.

## Maintenance notes

Stored aggregates must be updated in the same transaction as their source rows;
future grading paths should call this boundary rather than duplicate the sum.
