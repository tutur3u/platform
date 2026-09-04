# Plan 316: Characterize Nova Challenge-Manager Mutations

> **Executor instructions:** Add a focused route characterization suite for
> Nova's challenge-level privilege grant/revoke boundary. Freeze existing
> authorization and response behavior before any adjacent role refactor; do not
> broaden who can manage a challenge.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/nova/src/app/api/v1/challenges/[challengeId]/managers/route.ts' 'apps/nova/src/app/api/v1/challenges/[challengeId]/managers/route.test.ts' tmp/agent-coordination`

## Status

- **Execution status:** TODO — coordinate with Plan 013's adjacent role work
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** tests / privilege boundary
- **Depends on:** adjacent Plan 013 coordination; no exact-path owner
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

The route grants and revokes challenge-manager authority through a private
table and service-role client, but has no focused test. Authentication, global
role flags, assigned-manager scope, joined target identity, or mutation error
mapping can drift while Nova's canonical checks remain green.

## Current state and exact contract

- `apps/nova/src/app/api/v1/challenges/[challengeId]/managers/route.ts:16-54`
  authenticates a Nova app-session actor. A role manager or global challenge
  manager may administer every challenge; a challenge manager must already be
  assigned to the exact challenge.
- POST lines 67-126 accepts `adminEmail`, requires an enabled target whose role
  allows challenge management, verifies the challenge, inserts the private
  relation, maps duplicate `23505` to the current 400, and returns the inserted
  row with 201.
- DELETE lines 148-207 repeats actor authorization, deletes by exact
  challenge/email, and preserves its current 200 response even when no row is
  returned. Do not invent a not-found contract in this characterization plan.
- Missing actor-role data currently maps like authorization denial. Record the
  observed query-error behavior in tests, but if a real database error is
  indistinguishable from a missing role, add a deferred finding rather than
  silently changing the route in a test-only plan.
- The route directory contains no test. Follow Nova's existing route-test mock
  conventions and use an injectable/fake admin query chain; no live Supabase
  or private identity data.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Re-read Plan 013 and coordinate its retained Nova role
helper before extracting any shared seam. This plan is test-only unless a tiny
dependency-injection seam is strictly required.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/nova vitest run 'src/app/api/v1/challenges/[challengeId]/managers/route.test.ts'` | the complete POST/DELETE actor and failure matrix passes |
| Nova tests | `bun --cwd apps/nova vitest run` | all Nova unit/route tests pass |
| Typecheck/build | `bun run --cwd apps/nova type-check && bun run --cwd apps/nova build` | Nova compiles and builds |
| Repository | `bun check && git diff --check` | canonical checks pass and the diff is whitespace-clean |

## Scope

**In scope:** one colocated Nova route test; the route only if a minimal stable
test seam is unavoidable; `plans/README.md` status only.

**Out of scope:** changing platform role meanings; adding/removing Nova roles;
database policies or migrations; challenge catalog/submission/session behavior;
new response envelopes; Rust/TanStack migration; live provider/database calls.

## Steps

1. Build a deterministic admin-client fake that records query order and
   mutation predicates without reproducing private email values in snapshots.
2. Cover POST for missing challenge ID, anonymous actor, missing/disabled role,
   ordinary actor, global manager, role manager, correct assigned manager,
   wrong-challenge manager, invalid target, missing challenge, duplicate grant,
   database failure, and exact success payload.
3. Cover DELETE for missing parameters, the same actor matrix, exact
   challenge/email predicates, database failure, existing removal, and current
   zero-row success behavior. Prove every denial occurs before mutation.
4. Run focused/full Nova tests, typecheck/build, repository, whitespace, and
   exact-scope review.

## Done criteria

- [ ] Both privilege mutations have focused route-level coverage.
- [ ] Wrong-challenge and unauthorized actors cannot reach private mutations.
- [ ] Global, role, and exact assigned-manager success paths are frozen.
- [ ] Target eligibility, duplicate, missing, and database outcomes are explicit.
- [ ] Production behavior is unchanged and every mandatory gate passes.

## STOP conditions

Stop on Plan 013/exact-path overlap; source drift in role semantics; a test that
requires real private identity data; evidence that current authorization is
unsafe rather than merely uncovered; a necessary database/Rust/API contract
change; or any mandatory gate failing twice.
