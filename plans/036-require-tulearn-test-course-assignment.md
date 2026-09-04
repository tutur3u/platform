# Plan 036: Require Tulearn Course Assignment for Test Sessions

> **Executor instructions:** Make the test-session boundary prove that the
> selected published test belongs to the route workspace and to a course
> assigned to the learner. Apply one shared resolver to every session handler.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/learn/src/app/api/v1/workspaces/'[wsId]'/tulearn/courses/'[courseId]'/tests packages/education-core/src/tulearn`
> Stop on material assignment, parent-review, or test-session drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / Tenant isolation / Enrollment
- **Depends on:** Plan 032
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while Plan 032 remains blocked on generated database type
ownership. Resume only after its canonical learner identity invariant is DONE.

## Why this matters

Tulearn establishes a valid learner identity but its test-session handlers
accept globally selected course and test IDs through an admin client. A learner
can therefore start, inspect, answer, and submit a published test from an
unassigned course or another workspace when those IDs are known.

## Current state

- `packages/education-core/src/tulearn/courses.ts:268-295` is the canonical
  course-detail boundary: it derives assigned course IDs for the workspace user,
  rejects absent assignments, and scopes the course to `ws_id`.
- Test `start/route.ts:34-41`, `attempt/route.ts:67-76`,
  `save-answer/route.ts:67-74`, and `submit/route.ts:60-67` query only global
  `testId` plus `courseId` and publication state.
- Those handlers use the admin client after `resolveTulearnSubject`; that helper
  resolves learner/parent identity but does not authorize a course or test.
- Parent/read-only review and valid in-progress attempts need an explicit
  compatibility rule; they must not become a reason to skip assignment checks.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Read `packages/education-core/src/tulearn/access.ts`
and `courses.ts` fully. Complete Plan 032 first so the subject's platform and
workspace-user identities are a proven pair before assignment authorization.
Sequence after any active education owner reaches a canonical terminal state.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Core tests | `bun --cwd packages/education-core vitest run 'src/tulearn/test-access.test.ts'` | assignment matrix passes |
| Learn route tests | `bun --cwd apps/learn vitest run 'src/app/api/v1/workspaces/[wsId]/tulearn/courses/[courseId]/tests/test-access.route.test.ts'` | cross-tenant/unassigned cases pass |
| Learn typecheck | `bun run --cwd apps/learn type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Learn build | `bun run --cwd apps/learn build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- A shared Tulearn test-access resolver in `packages/education-core/src/tulearn`
  and its tests
- The start, attempt, save-answer, and submit routes under the path above plus
  one focused route test file

Do not redesign test authoring, scoring, assignment UX, or parent linking. Do
not expose unpublished tests or grading material as a compatibility fallback.

## Git workflow

- Branch: `fix/tulearn-test-assignment` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(learn): enforce test course assignment`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Define the access contract

Add fixtures covering an assigned learner, an unassigned learner in the same
workspace, a learner in another workspace, parent review, unpublished tests,
wrong course/test pairs, and an existing attempt whose assignment was later
removed. Decide and document the last case before implementation; default to
deny unless product policy explicitly permits completion/review.

### Step 2: Add one shared resolver

Resolve test to course and course to route workspace, then verify the subject's
workspace-user assignment using the same source as `getLearnerCourseDetail`.
Return only the authorized test/course records needed downstream. Keep mutation
versus read-only parent capability explicit.

### Step 3: Route every session operation through it

Replace local global-ID lookups in start, attempt, save-answer, and submit.
Ensure the access decision occurs before attempt, quiz, answer, or grading reads
and writes. Use consistent non-enumerating errors for cross-tenant and
unassigned targets.

## Test plan

- Add `packages/education-core/src/tulearn/test-access.test.ts` for the complete
  resolver matrix.
- Add the named Learn route test proving all four routes reject cross-workspace
  and unassigned IDs while valid enrollment works.
- Cover parent read-only review separately from start/save/submit denial.

## Done criteria

- [ ] Every test-session route proves workspace ownership and course assignment.
- [ ] Admin queries cannot cross the authorized test/course boundary.
- [ ] Parent and revoked-assignment semantics are explicit and tested.
- [ ] Core/route tests, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if assignment can come from multiple sources with conflicting precedence,
if historical attempts require an operator-approved grandfathering rule, or if
the course/workspace relationship cannot be enforced without schema changes.

## Maintenance notes

Future test-session endpoints must consume the shared resolver rather than
repeating global-ID checks.
