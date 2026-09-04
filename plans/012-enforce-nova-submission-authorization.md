# Plan 012: Enforce Nova Submission Authorization and Grading Integrity

> **Executor instructions:** Restore the owner-or-challenge-manager boundary
> that existed before Nova runtime tables moved behind admin-only access. Never
> trust a caller-supplied user ID or `includeHiddenTestCases` flag. Run every
> negative-call assertion before the full suite.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/nova/src/lib/challenge-management-auth.ts apps/nova/src/app/api/v1/submissions apps/nova/src/app/'[locale]'/'(dashboard)'/shared apps/nova/src/app/'[locale]'/'(dashboard)'/challenges/'[challengeId]'/results`
> Any authorization or grading-flow change is a STOP until this plan is
> reconciled with the live contract.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / Correctness / Nova
- **Depends on:** Plan 013
- **Planned at:** commit `68a1457aed`, 2026-08-10

Execution is blocked while Plan 013's reviewed authorization foundation remains
uncommitted behind the mandatory Nova build gate. Do not duplicate or bypass
that helper work in this broader submission plan.

## Why this matters

Nova's runtime tables moved into the private schema, so route handlers and
server actions now use the service-role client and must reproduce authorization
in application code. Several submission paths authenticate a Nova app session
but never bind the requested submission to that actor. More critically, a
submission owner can directly write their own criterion scores and test-case
`matched` results, while a server action trusts a caller boolean to reveal
hidden test inputs and expected outputs. A participant can therefore read or
delete another participant's submission, expose hidden challenge material, or
alter grading data.

## Current state

The historical RLS contract in
`apps/database/supabase/migrations/20250416164428_optimize_nova_challenge_role_rls.sql:98-103`
allowed submission access only when `user_id = auth.uid()` or the actor was a
Nova challenge manager. Private-schema service-role access bypasses that policy.

`apps/nova/src/app/api/v1/submissions/[submissionId]/route.ts:21-26` reads by ID
alone, and DELETE repeats the pattern at lines 130-134. PUT updates by ID alone
and assigns ownership to the caller:

```ts
if (body.sessionId !== undefined) updateData.session_id = body.sessionId;
updateData.user_id = user.id;

await supabase
  .schema('private')
  .from('nova_submissions')
  .update(updateData)
  .eq('id', submissionId);
```

`apps/nova/src/app/api/v1/submissions/[submissionId]/criteria/route.ts:100-127`
proves the participant owns the submission and then accepts their supplied
`score` and `feedback`. The sibling test-case route does the same for `output`
and `matched` at lines 104-131. Both DELETE handlers authenticate but omit even
the ownership check.

`apps/nova/src/app/[locale]/(dashboard)/shared/actions.ts:5-22` accepts both a
submission ID and caller-controlled `includeHiddenTestCases`, creates an admin
client, and joins hidden test definitions including expected output without
resolving an actor or owner. The client derives the flag as `!session`, but a
server-action argument is not an authorization boundary.

`apps/nova/src/app/[locale]/(dashboard)/challenges/[challengeId]/results/actions.ts:182-229`
accepts an arbitrary target `userId` and reads that user's sessions/submissions
with an admin client before authenticating or checking challenge management.

The current authorization exemplar is
`apps/nova/src/lib/challenge-management-auth.ts`: it resolves the registered
Nova actor, requires an enabled role, supports global managers, and constrains
ordinary challenge managers through `nova_challenge_manager_emails`. Route-test
structure is exemplified by
`apps/nova/src/app/api/v1/nova/teams/[id]/route.test.ts`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Auth helper | `bun --cwd apps/nova vitest run src/lib/nova-submission-auth.test.ts` | exit 0; owner/manager/denial matrix passes |
| Submission routes | `bun --cwd apps/nova vitest run 'src/app/api/v1/submissions/[submissionId]/route.test.ts' 'src/app/api/v1/submissions/[submissionId]/criteria/route.test.ts' 'src/app/api/v1/submissions/[submissionId]/test-cases/route.test.ts'` | exit 0; unauthorized queries/mutations are never reached |
| Server actions | `bun --cwd apps/nova vitest run 'src/app/[locale]/(dashboard)/shared/actions.test.ts' 'src/app/[locale]/(dashboard)/challenges/[challengeId]/results/actions.test.ts'` | exit 0; hidden/target-user access is server-authorized |
| Typecheck | `bun run --cwd apps/nova type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Nova build | `bun run --cwd apps/nova build` | exit 0; changed routes/actions compile |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:**

- New `apps/nova/src/lib/nova-submission-auth.ts` and its unit test
- `apps/nova/src/lib/challenge-management-auth.ts` only if a small existing
  helper must be exported/reused; update its test in lockstep
- The main submission, criterion, and test-case route files and new sibling
  `route.test.ts` files
- `apps/nova/src/app/[locale]/(dashboard)/shared/actions.ts`, its caller
  `prompt-form.tsx`, and a new `actions.test.ts`
- `apps/nova/src/app/[locale]/(dashboard)/challenges/[challengeId]/results/actions.ts`
  and a new sibling test

**Out of scope:** database migrations/RLS, challenge catalog authorization,
evaluation algorithms, attempt limits, scoring formulas, UI redesign, and the
missing re-evaluate route. Do not change problem/session identity mutability in
this plan unless a focused test proves it is required to close the authorization
boundary; split that contract decision into a separate plan.

## Git workflow

- Branch: `fix/nova-submission-authorization` in an isolated worktree.
- Conventional Commit: `fix(nova): enforce submission authorization`.
- Do not push/open a PR unless instructed. Claim the Git commit window before
  staging/committing; never stage coordination notes.

## Steps

### Step 1: Create one submission authorization context

Add `nova-submission-auth.ts`. It must resolve the actor from the actual Request
or server-action headers, create/inject the admin client, load the submission's
minimal `id`, `user_id`, and challenge identity through its problem, and return
a discriminated result containing the actor, submission, admin/private client,
and whether the actor can manage that challenge.

Access rules:

- Missing/invalid Nova app session: unauthenticated.
- Missing submission or foreign participant: the API-facing helper returns the
  established non-enumerating 404/denial result.
- Owner: may read and use the existing owner-level submission operations.
- Enabled manager authorized by `canManageNovaChallenge`: may read/manage the
  submission and grading records for that challenge.
- Disabled, wrong-challenge, or unrelated users: denied.

Keep Request and server-action adapters thin; share the database/role decision.
Do not accept a caller-provided actor ID, email, role, or manager boolean.

**Verify:** helper tests cover owner, global manager, assigned manager,
wrong-challenge manager, disabled role, unrelated enabled user, missing
submission, and anonymous actor. Negative cases never return the private client
as an authorized context.

### Step 2: Bind the main submission route

Authorize GET, PUT, and DELETE before returning or mutating the row. Preserve
owner-or-manager access. Remove `updateData.user_id = user.id`; authorization
must never transfer ownership as a side effect. Keep the existing accepted
fields and response shapes otherwise. Apply a final identity predicate or
equivalent atomic guard so the mutation cannot affect a different row than the
one authorized.

**Verify:** route tests prove an owner and correct challenge manager succeed;
an unrelated authenticated user receives the non-enumerating denial; PUT cannot
change `user_id`; and denied GET/PUT/DELETE make zero terminal read/update/delete
calls after authorization fails.

### Step 3: Make grading mutations manager-only

For criterion and test-case routes, keep owner-or-manager GET access, but require
an enabled manager authorized for the submission's challenge before PUT or
DELETE. A participant must never write `score`, `feedback`, `output`, or
`matched`, including on their own submission. Validate the referenced criterion
or test case belongs to the same challenge before upsert so a manager cannot
cross-link catalog records from another challenge.

**Verify:** both route suites cover owner read success, owner mutation denial,
assigned/global manager mutation success, wrong-challenge manager denial,
cross-challenge criterion/test-case denial, and unauthenticated rejection.
Denied cases never call upsert/delete.

### Step 4: Authorize full-submission server actions

Change `getFullSubmission` to resolve the server-action actor and submission
authorization itself. Remove the `includeHiddenTestCases` parameter and update
`prompt-form.tsx` accordingly. Owners may receive only non-hidden test cases;
only an authorized challenge manager may receive hidden definitions and
expected outputs. Query grading rows only after authorization succeeds.

**Verify:** the server-action test proves owner data is filtered to visible
cases, manager data may include hidden cases, a foreign submission returns the
non-enumerating result, and no client argument can elevate visibility.

### Step 5: Authorize cross-user result aggregation

At the start of `fetchAllProblems`, resolve the server-action actor and call
`canManageNovaChallenge(actor, challengeId, sbAdmin)`. Only after success may
the supplied `userId` be treated as the report subject. Preserve the existing
result shape and user filter. Reject anonymous, disabled, or wrong-challenge
actors before any problem/session query.

**Verify:** tests cover assigned/global manager success, participant denial even
when requesting their own ID, wrong-challenge manager denial, and anonymous
denial. Negative cases make no private-table queries.

### Step 6: Run the complete gates

Run every command in the table, ending with the Nova build and whitespace
check. Expected: all commands exit 0 and `git diff --check` prints nothing.

## Done criteria

- [ ] Submission GET/PUT/DELETE enforce owner-or-authorized-manager access.
- [ ] Submission updates never rewrite ownership.
- [ ] Participants cannot write or delete criterion scores or test-case results.
- [ ] Criterion/test-case mutations cannot cross challenge boundaries.
- [ ] Hidden test definitions and expected outputs are disclosed only after a
  server-side manager check.
- [ ] Cross-user result aggregation requires management of the target challenge.
- [ ] Focused tests, Nova typecheck, `bun check`, Nova build, and whitespace pass.
- [ ] `git status --short` contains only the listed Nova paths and index update.

## STOP conditions

Stop if grading is intentionally client-authored, participants intentionally
receive hidden expected outputs, the submission-to-challenge relationship cannot
be resolved without schema work, or active coordination claims an in-scope Nova
path. Do not preserve an insecure historical behavior merely because a client
currently depends on it; report the product-contract conflict for an explicit
decision.

## Maintenance notes

Every service-role Nova endpoint or server action must re-establish the former
RLS policy before touching private tables. Reviewers should focus on negative
call ordering, manager-to-challenge binding, and removal of caller-controlled
authorization inputs. A future database RPC could make authorization plus
mutation atomic, but is intentionally deferred until the application boundary
is characterized.
