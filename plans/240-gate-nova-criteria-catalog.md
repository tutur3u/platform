# Plan 240: Gate the Nova Criteria Catalog to Challenge Managers

> **Executor instructions:** Treat evaluation criteria as challenge-management
> data. Reuse the completed catalog actor model so ordinary Nova authentication
> never exposes all rubrics or a criterion from another manager's challenge.
>
> **Drift check (run first):**
> `git diff --stat ce6a148ac8..HEAD -- apps/nova/src/app/api/v1/criteria apps/nova/src/lib/challenge-catalog-access.ts apps/nova/src/lib/challenge-management-auth.ts 'apps/nova/src/app/[locale]/(dashboard)/challenges' tmp/agent-coordination`

## Status

- **Execution status:** TODO
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** security / authorization / private catalog
- **Depends on:** Plan 090 DONE; execute from reviewed commit `ce6a148ac8` or a
  main base that contains its exact catalog helper contract
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Criteria collection and detail GETs currently require only an authenticated
Nova actor and use an admin client, so any actor can enumerate private judging
rubrics for every challenge. The live challenge management page loads criteria
only for managers, and Plan 090 already established global-manager,
assigned-manager, participant, and denied catalog identities for adjacent
challenge/problem reads.

## Current state and exact contract

- Criteria are management-only. Participants, including eligible participants
  with an active challenge session, receive `403 {message:'Forbidden'}`. Their
  submission-result criteria data remains available only through the existing
  submission routes and is out of scope.
- Global managers may list every criterion, filter by any challenge, and read
  any criterion by ID.
- Assigned managers may list criteria only for their assigned challenge IDs.
  An explicit `challengeId` outside that set returns 403; an unfiltered request
  returns only rows whose `challenge_id` is in the assigned set (empty set =>
  `[]`). Detail GET resolves the criterion's challenge first and returns 403 for
  an existing criterion outside the assigned set.
- Missing criterion remains `404 {message:'Criterion not found'}` for an
  authorized global manager. For non-global actors, resolve the row without
  exposing its content, then apply authorization; preserve the existing 404 for
  a truly missing UUID and 403 for a known but unauthorized criterion.
- Preserve successful row projections/order and all POST/PUT/DELETE behavior.
  Database/query failures remain sanitized 500s.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`; read Nova's nearest AGENTS file. Confirm the execution base
contains `resolveNovaCatalogActor` from Plan 090 and do not recreate a second
role model. No active note currently owns the exact criteria routes.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Collection | `bun --cwd apps/nova vitest run src/app/api/v1/criteria/route.test.ts` | global/assigned/participant matrix passes |
| Detail | `bun --cwd apps/nova vitest run 'src/app/api/v1/criteria/[criterionId]/route.test.ts'` | assigned cross-challenge denial and 404 behavior pass |
| Catalog regression | `bun --cwd apps/nova vitest run src/app/api/v1/challenges/route.test.ts src/app/api/v1/problems/route.test.ts 'src/app/api/v1/problems/[problemId]/route.test.ts'` | Plan 090 behavior remains green |
| Nova | `bun run --cwd apps/nova type-check && bun run --cwd apps/nova build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** criteria collection/detail GET branches and new colocated tests;
small reuse-oriented additions to `challenge-catalog-access.ts` if necessary.
**Out of scope:** criteria mutations, challenge/problem projections, session
admission, submission evaluation/results, database schema/types, UI, or direct
Supabase policy changes.

## Steps

1. Add red tests for anonymous, disabled Nova actor, ordinary participant,
   eligible active-session participant, global manager, assigned manager with
   zero/one/multiple challenge assignments, explicit foreign challenge, and
   foreign/missing criterion detail.
2. Resolve the catalog actor once per request. For collection reads, build the
   query only after authorization: global manager is unrestricted; assigned
   manager receives an `.in('challenge_id', assignedIds)` boundary or the exact
   requested assigned ID; participant/denied exits before the criteria query.
3. For detail, select only the minimal criterion/challenge identity needed for
   authorization, apply global/assigned-manager access, then return the current
   full criterion projection only when allowed. Do not add active-session
   participant access.
4. Run focused and Plan 090 regression tests, Nova typecheck/build, repository,
   whitespace, and exact-scope gates.

## Done criteria

- [ ] Ordinary Nova actors cannot enumerate or read private criteria.
- [ ] Assigned managers see only criteria belonging to assigned challenges.
- [ ] Global managers retain the complete criteria management catalog.
- [ ] Criteria mutations and participant submission-result data are unchanged.
- [ ] Focused/regression tests, Nova typecheck/build, repository, and whitespace
      pass.

## STOP conditions

Stop if a supported participant caller requires raw challenge criteria, the
Plan 090 helper is absent or semantically drifted, an active owner appears,
response projections must change, or any mandatory gate fails twice.
