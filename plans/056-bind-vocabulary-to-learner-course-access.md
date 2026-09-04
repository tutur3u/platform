# Plan 056: Bind Vocabulary to Learner Course Access

> **Executor instructions:** Make vocabulary follow the same learner subject,
> assignment, publication, and progression-lock boundary as module detail.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/learn/src/app/api/v1/workspaces/[wsId]/course-modules/[moduleId]/vocabulary/route.ts' 'apps/learn/src/app/api/v1/workspaces/[wsId]/tulearn/courses/[courseId]/modules/[moduleId]' apps/learn/src/components/learner-pages/learner-vocabulary.tsx 'apps/learn/src/app/[locale]/(dashboard)/[wsId]/courses/[courseId]/course-vocabulary-shell.tsx' packages/education-core/src/tulearn packages/internal-api/src/tulearn.ts packages/internal-api/src/tulearn.test.ts packages/internal-api/src/index.ts`
> Stop if Plan 032 is incomplete, learner module authorization changed, or the
> education extraction coordination note remains active/noncanonical.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / Education content authorization
- **Depends on:** Plan 032; education extraction ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The learner vocabulary endpoint accepts any workspace-bound module UUID after
ordinary membership. It can expose vocabulary from unassigned, unpublished, or
progression-locked course material that the canonical module-detail service
correctly hides.

## Current state

- `course-modules/[moduleId]/vocabulary/route.ts:90-153` checks membership and
  module workspace only, then reads vocabulary with the admin client.
- `packages/education-core/src/tulearn/courses.ts:451-476` calls
  `getLearnerCourseDetail`, finds the module inside an assigned course, and
  returns null for missing or locked modules.
- The canonical module route resolves `studentId` through
  `resolveTulearnSubject` before calling `getLearnerModuleDetail`.
- `course-vocabulary-shell.tsx` already knows `courseId`, `wsId`, and optional
  `studentId`, but `LearnerVocabulary` currently receives only `moduleId`.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and the Learn app's
nearest instructions. Execute after Plan 032 so parent subject identities are
canonical. The top-level
`tmp/agent-coordination/20260709-075711-claude-education-extraction.md` uses a
noncanonical status and claims the Learn API, education-core, and internal-api
paths; treat it as active until its owner canonicalizes/archives it or explicitly
transfers ownership. Preserve read-only parent behavior; do not grant generic
workspace members learner content access.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun run --cwd apps/learn test -- 'src/app/api/v1/workspaces/[wsId]/tulearn/courses/[courseId]/modules/[moduleId]/vocabulary/route.test.ts'` | learner access matrix passes |
| UI tests | `bun run --cwd apps/learn test -- src/components/learner-pages/learner-vocabulary.test.tsx` | course/student request contract passes |
| Core tests | `bun --cwd packages/education-core vitest run src/tulearn/courses.test.ts` | module access cases pass |
| Internal API tests | `bun run --cwd packages/internal-api test -- src/tulearn.test.ts` | typed vocabulary request passes |
| Typechecks | `bun run --cwd apps/learn type-check && bun run --cwd packages/education-core type-check` | both exit 0 |
| Internal API typecheck | `bun run --cwd packages/internal-api type-check` | exit 0 |
| Auth guard | `node scripts/check-internal-app-auth.js` | no satellite auth regression |
| Repository gate | `bun check` | exit 0 |
| Learn build | `bun run --cwd apps/learn build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Add a vocabulary GET below the canonical Tulearn course/module route tree,
  with the exact focused test named above
- Remove the old membership-only handler after switching every caller
- Pass `courseId` and optional `studentId` through the vocabulary shell/component
- A small education-core vocabulary projection helper if needed, plus a new
  `packages/education-core/src/tulearn/courses.test.ts` characterization file
- `packages/internal-api/src/tulearn.ts`, its new focused test, and the package
  index only as needed to expose the typed vocabulary reader

Do not change vocabulary authoring, pronunciation/speech APIs, course assignment,
lock progression rules, or parent identity storage.

## Git workflow

- Branch: `fix/learn-vocabulary-course-access` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(learn): authorize learner vocabulary`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Put the route under the canonical identity

Create the route at
`.../tulearn/courses/[courseId]/modules/[moduleId]/vocabulary/route.ts` using
the same `withSessionAuth`, `resolveTulearnSubject`, error mapping, and admin
injection pattern as the sibling module-detail GET.

### Step 2: Reuse learner module authorization

Call `getLearnerModuleDetail` (or a factored access helper with identical
semantics) using the resolved platform/workspace student pair. Only query and
project vocabulary after that function proves course assignment, publication,
module membership, and unlocked progression. Return the same non-disclosing
404 used for inaccessible module detail.

### Step 3: Carry course and subject context from the UI

Pass `courseId` and `studentId` from `CourseVocabularyShell` into
`LearnerVocabulary`; use the internal API client if an existing Learn facade
covers this route, otherwise add the smallest typed facade rather than a new
raw client fetch. Remove the old route only after searches prove no caller remains.

## Test plan

Cover self learner with assigned/unassigned course, published/unpublished
module, unlocked/locked progression, mismatched course/module, authorized
parent subject, unauthorized parent, guest/anonymous, and downstream query
suppression on every denial. UI coverage must assert course and `studentId` are
forwarded and encoded.

## Done criteria

- [ ] Vocabulary is returned only after canonical learner-module authorization.
- [ ] Parent reads use the subject fixed by Plan 032.
- [ ] The membership-only route and all callers are removed.
- [ ] Route/UI/core tests, typechecks, auth guard, repository gate, build, and whitespace pass.

## STOP conditions

Stop if vocabulary is intentionally available before module unlock, if a guest
flow has a separate approved capability not represented by Tulearn subjects, or
if Plan 032 changes the parent query contract after this plan's drift check.
Do not begin while the education extraction coordination note remains active.

## Maintenance notes

Learner content tabs must derive access from course/module detail, never from a
workspace-only content lookup.
