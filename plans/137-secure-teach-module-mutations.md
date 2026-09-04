# Plan 137: Put Teach Module Mutations Behind the Education Boundary

> **Executor instructions:** Preserve the existing three HTTP paths, but make
> every mutation authenticate through the Teach session wrapper, require the
> canonical education workspace capability, validate a strict bounded body,
> and prove every referenced quiz set/module/course belongs to the normalized
> route workspace before writing.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/teach/src/app/api/v1/workspaces/[wsId]/courses/[courseId]/modules/route.ts' 'apps/teach/src/app/api/v1/workspaces/[wsId]/quiz-sets/[setId]/modules/route.ts' 'apps/teach/src/app/api/v1/workspaces/[wsId]/quiz-sets/[setId]/modules/[moduleId]/route.ts' 'apps/teach/src/app/api/v1/workspaces/[wsId]/user-groups/[groupId]/modules/route.ts' 'apps/teach/src/app/api/v1/workspaces/[wsId]/quiz-sets/[setId]/linked-modules/route.ts' packages/education-core/src/education/access.ts packages/internal-api/src/education.ts tmp/agent-coordination`
> The maintained routes, access helper, internal-api caller, and coordination
> notes are read-only evidence. Stop on authorization, payload, caller, or
> ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** security
- **Depends on:** education-extraction ownership note canonicalization/archival or exact-path transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

These legacy Teach mutations ignore the route workspace and rely on broad
organization-member RLS. Ordinary members can create arbitrary module fields
without the maintained `manage_users` boundary or change quiz-set relationships
without the maintained `ai_lab` boundary; dual-workspace members can also link
objects across tenants.

## Current state

- `courses/[courseId]/modules/route.ts:22-42` ignores `wsId`, spreads untyped
  JSON into `workspace_course_modules`, and relies only on a cookie client.
- `quiz-sets/[setId]/modules/route.ts:5-31` accepts an unbounded string array,
  ignores `wsId`, and upserts relationships without parent containment.
- The sibling DELETE route repeats the same unscoped session-client mutation.
- `packages/education-core/src/education/access.ts:26-115` supplies the canonical
  normalized-workspace, membership, feature-flag, `ai_lab`, and admin-client
  boundary. Maintained Teach routes combine it with `withSessionAuth`.
- `user-groups/[groupId]/modules/route.ts:20-39` defines the strict module
  creation fields and bounds. Match that contract; do not accept `group_id`,
  `sort_key`, timestamps, or IDs from the body.
- `packages/internal-api/src/education.ts:538-574` is the tracked caller of the
  quiz-set link/unlink paths, so their success envelopes must remain stable.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Do not begin while
the top-level education-extraction note still claims `apps/teach/src/**`; its
bulleted `done` state must be canonically resolved/archived or the exact paths
transferred first. Re-run caller searches before editing. These are Teach
satellite routes, not Web legacy routes; do not touch Rust/TanStack migration
artifacts.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused routes | `bun --cwd apps/teach vitest run 'src/app/api/v1/workspaces/[wsId]/courses/[courseId]/modules/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/quiz-sets/[setId]/modules/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/quiz-sets/[setId]/modules/[moduleId]/route.test.ts'` | all authorization, containment, validation, and success cases pass |
| Teach typecheck | `bun run --cwd apps/teach type-check` | exit 0 |
| Teach build | `bun run --cwd apps/teach build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the three named legacy route files; three colocated focused tests
(create); one small shared route-contract/helper module under the nearest Teach
API subtree if needed to keep files below 700 lines; README status.

**Out of scope:** maintained route URLs/response shapes, client UX, internal-api
URLs, course/module schema, RLS migrations, grading, ordering algorithms,
translations, Web/Rust/TanStack artifacts, and unrelated education routes.

**Read-only drift evidence:** the maintained module/linked-module routes,
education access helper, internal-api caller, historical RLS, and coordination
notes.

## Git workflow

Use `fix/secure-teach-module-mutations`, run `bun setup`, and commit
`fix(teach): secure module mutations`. Claim/release the commit window; do not
push unless instructed.

## Steps

### Step 1: Freeze the existing public contracts and denials

Create focused tests using the auth/access mock shape in
`education/attempts/route.test.ts`. Characterize the existing successful
envelopes, then add cookie/app-session success, missing membership, disabled
education, missing `manage_users` for module creation, missing `ai_lab` for quiz
links, malformed JSON, unknown fields, oversized arrays, foreign course/group,
foreign quiz set, foreign module, and mixed-workspace module-array cases. Every
authorization denial must occur before `request.json`, admin lookup, or mutation.

**Verify:** the focused command fails only on the missing live authorization,
strict-schema, or containment checks; all mocks expose zero writes on denial.

### Step 2: Secure course-module creation

Wrap POST with `withSessionAuth` using
`{allowAppSessionAuth:{targetApp:'teach'}, rateLimit:{maxRequests:60,
windowMs:60000}}`, parse `{wsId, courseId}` strictly, and call
`requireEducationWorkspaceAccess` with `permission: 'manage_users'` before
reading the body or doing admin work. Use the maintained
creation allowlist and limits. Prove `courseId` is a `workspace_user_groups.id`
whose `ws_id` equals `normalizedWsId`, and prove `module_group_id` belongs to
that course before inserting an explicitly constructed row. Preserve the
current `{message:'success'}` response for compatibility.

**Verify:** its focused test passes and foreign/unknown/system fields never
reach the admin insert.

### Step 3: Secure quiz-set linking and unlinking

Wrap both handlers with `withSessionAuth` using the exact Teach app-session
option `{allowAppSessionAuth:{targetApp:'teach'}}` plus the maintained mutation
rate limit, and canonical education access before reading a body or doing admin
work.
Require GUID route params; accept a strict, deduplicated `moduleIds` array of
1–100 GUIDs. Prove the quiz set belongs to the normalized workspace and fetch
all requested modules through their course-group workspace join; require an
exact ID-count match before one upsert. DELETE must prove both parents are in
the same route workspace before its pair-scoped delete. Preserve success and
stable 400/403/404/500 envelopes without returning database details.

**Verify:** both focused suites pass, including a mixed valid/foreign batch
that performs zero writes.

### Step 4: Run all gates

Run the focused suite, Teach typecheck/build, `bun check`, and whitespace.
Confirm status contains only scoped routes/tests/helper plus README.

## Done criteria

- [ ] Every mutation uses Teach session auth plus canonical education access.
- [ ] Course, group, quiz set, module group, and modules are route-workspace bound.
- [ ] Bodies are strict, bounded, deduplicated, and system fields are rejected.
- [ ] Denials invoke no write; tracked success envelopes remain compatible.
- [ ] Focused, typecheck, build, repository, and whitespace gates pass.

## STOP conditions

Stop if the education note is not resolved/transferred, another active owner
claims an exact path, a tracked caller requires a body
field excluded by the maintained schema, the education permission contract has
changed, a parent table lacks the cited workspace relationship, a migration is
required, or a gate fails twice.

## Maintenance notes

These compatibility paths should eventually delegate to one maintained route
contract. Do not broaden RLS or retain raw body spreads to preserve undocumented
clients.
