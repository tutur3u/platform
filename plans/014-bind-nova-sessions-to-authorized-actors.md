# Plan 014: Bind Nova Sessions to Authorized Actors

> **Executor instructions:** Restore the former owner-or-challenge-manager
> access policy around the private-schema admin client. Do not solve this by
> removing legitimate manager access or by trusting a role flag from the client.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/nova/src/app/api/v1/sessions apps/nova/src/lib/challenge-management-auth.ts`
> Stop if session ownership, challenge relations, or manager semantics changed.

## Status

- **Execution status:** TODO
- **Priority:** P0
- **Effort:** S
- **Risk:** MED
- **Category:** Security / Correctness / Nova
- **Depends on:** Plan 013
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

The Nova session detail route authenticates a caller but reads, updates, and
deletes private-schema sessions by UUID alone through a service-role client.
PUT also rewrites `user_id` to the caller. One ordinary Nova user can therefore
read another user's challenge session, take ownership of it, alter its timing or
challenge, or delete it. Sessions cascade into attempts and submissions, so the
impact reaches challenge integrity rather than only profile data.

## Current state

`apps/nova/src/app/api/v1/sessions/[sessionId]/route.ts:21-26` selects by `id`
alone. PUT at lines 83-97 builds caller-controlled timing/status/challenge data,
sets `updateData.user_id = user.id`, and updates by ID alone. DELETE at lines
133-137 also filters only by ID.

The collection route correctly filters GET by `.eq('user_id', user.id)` and
sets `user_id` server-side on POST; it is included only for regression tests,
not semantic changes. Historical policy in
`apps/database/supabase/migrations/20250424141642_separate_nova_session_rls.sql`
allowed the owner or a Nova challenge manager. The current challenge-bound
manager helper is `canManageNovaChallenge` in
`apps/nova/src/lib/challenge-management-auth.ts`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Detail route | `bun --cwd apps/nova vitest run 'src/app/api/v1/sessions/[sessionId]/route.test.ts'` | exit 0; owner/manager/foreign matrix passes |
| Collection regression | `bun --cwd apps/nova vitest run src/app/api/v1/sessions/route.test.ts` | exit 0; list/create remain actor-bound |
| Nova typecheck | `bun --cwd apps/nova run type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Nova build | `bun --cwd apps/nova run build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/nova/src/app/api/v1/sessions/[sessionId]/route.ts` and new sibling test
- New `apps/nova/src/lib/nova-session-auth.ts` and test if sharing the
  owner/manager decision keeps handlers simple
- `apps/nova/src/lib/challenge-management-auth.ts` only for reuse, plus its test
- New `apps/nova/src/app/api/v1/sessions/route.test.ts` for collection
  characterization; do not change the collection route without a failing case

Out of scope: attempt-limit algorithms, challenge availability, session expiry
cron, submissions/grading (Plan 012), role mutation (Plan 013), and schema/RLS.

## Git workflow

- Branch: `fix/nova-session-authorization` in an isolated worktree.
- Conventional Commit: `fix(nova): bind session object access`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging/committing; never stage coordination notes.

## Steps

### Step 1: Characterize collection behavior

Add collection route tests proving GET filters the authenticated actor and POST
ignores any caller ownership field in favor of that actor. Cover anonymous and
invalid JSON paths. Do not broaden the collection response or pagination in
this plan.

**Verify:** the collection test exits 0 against current intended behavior.

### Step 2: Add one session object authorization helper

Resolve the actor from the actual Request before creating the admin client.
Load the target session's minimal `id`, `user_id`, and `challenge_id`. Authorize
the owner or an enabled actor for whom
`canManageNovaChallenge(actor, challenge_id, client)` returns true. Return a
non-enumerating not-found/denial result for unrelated actors. Keep clients
injectable for tests.

**Verify:** helper tests cover owner, assigned/global manager, wrong-challenge
manager, disabled role, unrelated user, missing session, and anonymous actor.

### Step 3: Bind GET, PUT, and DELETE

Use the helper before returning or mutating session data. Remove
`updateData.user_id = user.id`; an authorized update must not transfer
ownership. Preserve existing response shapes and accepted update fields. Apply
an identity predicate or equivalent atomic guard so the terminal update/delete
cannot target a different session than the authorized row.

**Verify:** owner and correct manager succeed; unrelated callers receive the
non-enumerating denial; PUT never includes `user_id`; denied GET/PUT/DELETE make
zero terminal mutation/data-return calls.

### Step 4: Validate the existing update contract

Replace the `any` accumulator with a strict Zod payload using the existing
field names/types. Reject unknown fields and invalid status/time/UUID values.
Do not invent new status transitions here; if the current schema permits
impossible transitions, record a follow-up correctness plan.

**Verify:** focused tests cover each accepted field, empty/unknown/invalid
payloads, malformed JSON, and prove the update object has no ownership field.

### Step 5: Run all gates

Run every command in the table. Expected: all Bun commands exit 0 and
`git diff --check` prints nothing.

## Done criteria

- [ ] Session detail GET/PUT/DELETE require owner or authorized manager access.
- [ ] Session updates cannot transfer ownership.
- [ ] Unrelated users and wrong-challenge managers cannot read or mutate rows.
- [ ] Collection GET/POST remain bound to the authenticated actor.
- [ ] Focused tests, typecheck, `bun check`, Nova build, and whitespace pass.

## STOP conditions

Stop if managers must have read-only rather than mutation access, session
challenge identity can legitimately change across managers, a test reveals
attempt limits are bypassed by PUT, or active coordination claims the path.
Record the policy conflict instead of guessing.

## Maintenance notes

Private-schema migration removed database RLS as a safety net. Future session
methods must reuse this authorization boundary and must not assign ownership
during updates. Reviewers should scrutinize authorization-to-mutation ordering.

