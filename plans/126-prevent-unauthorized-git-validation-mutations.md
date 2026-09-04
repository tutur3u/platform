# Plan 126: Prevent Unauthorized Git Validation-State Mutations

> **Executor instructions:** Move Git administration authorization outside the
> validation failure handler so framework redirects and authorization failures
> can never write global GitHub App validation state. Add focused server-action
> tests before changing control flow.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/git/src/app/[locale]/-/[wsId]/admin-actions.ts' 'apps/git/src/app/[locale]/-/[wsId]/admin-actions.test.ts' apps/git/src/lib/admin-access.ts apps/git/src/lib/github/credentials.ts apps/git/src/lib/github/errors.ts`
> Quote the bracketed paths in the shell. Stop if authorization, redirect, or
> validation-state behavior has changed materially.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `d1831f943529bbcf68984285a0bd901656f920b3`
  on branch `fix/git-validation-auth-control-flow`; focused and full Git tests,
  typecheck/build, `bun check`, whitespace, and hooks passed
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** Security / authorization control flow
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

`validateConfigurationAction` catches Next.js's redirect exception from a
failed admin authorization check and treats it as a GitHub validation failure.
The catch path then uses a cookie-free admin client to clear the global
validation timestamp and overwrite its error/update fields. An unauthenticated
or unauthorized invocation can therefore mutate privileged operator state
despite failing authorization.

## Current state

- `apps/git/src/lib/admin-access.ts:8-24` returns `null` when no Git satellite
  actor exists or the actor lacks `manage_git_repositories`; only authorized
  callers receive the admin context.
- `apps/git/src/app/[locale]/-/[wsId]/admin-actions.ts:96-120` performs that
  check inside a broad `try`, calls `redirect('/login')`, catches the redirect,
  and then calls `updateGitAppValidation` from the catch path.
- `apps/git/src/lib/github/credentials.ts:171-186` writes
  `last_validated_at`, `last_validation_error`, and `updated_at` on the global
  `primary` configuration row through a no-cookie admin client.
- `packages/users-core/src/routes/notifications/route.ts:172` demonstrates the
  repository's `unstable_rethrow(error)` convention where framework control-
  flow exceptions must pass through a catch. For this action, completing the
  authorization gate before the validation `try` is simpler and stronger.
- `apps/git` has no existing server-action test; use the `next/navigation` mock
  pattern in `apps/web/src/__tests__/tasks-app-redirects.test.ts`.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Confirm no active
note owns the two Git action paths. Treat redirect exceptions as control flow,
not application failures. Never expose stored GitHub credentials or validation
details in test fixtures.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused action suite | `bun --cwd apps/git vitest run 'src/app/[locale]/-/[wsId]/admin-actions.test.ts'` | all new authorization and validation cases pass |
| Git typecheck | `bun run --cwd apps/git type-check` | exit 0 |
| Git suite | `bun run --cwd apps/git test` | all tests pass |
| Git build | `bun run --cwd apps/git build` | exit 0 |
| Workspace gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:**

- `apps/git/src/app/[locale]/-/[wsId]/admin-actions.ts`
- `apps/git/src/app/[locale]/-/[wsId]/admin-actions.test.ts` (create)
- `plans/README.md` only for the executor's status update

**Out of scope:**

- Git credential encryption, installation-token logic, repository registration,
  or audit-event semantics
- changes to `requireGitAdmin`, database schema/RLS, or public response copy
- package manifests, dependencies, translations, and `bun.lock`

**Read-only drift evidence (inspect, do not edit):**

- `apps/git/src/lib/admin-access.ts`
- `apps/git/src/lib/github/credentials.ts`
- `apps/git/src/lib/github/errors.ts`

## Git workflow

Use isolated branch `fix/git-validation-auth-control-flow`, run `bun setup`,
and commit `fix(git): authorize validation before state updates`. Claim and
release the commit window. Do not push unless instructed.

## Steps

### Step 1: Characterize the authorization failure first

Create the server-action test with hoisted mocks for `requireGitAdmin`,
`redirect`, `getInstallationToken`, `fetch`, `updateGitAppValidation`, and
`recordGitAuditEvent`. Make the redirect mock throw a stable sentinel as Next
does. Prove the current action catches that sentinel and invokes the validation
writer; this regression test should fail once the desired assertion is stated.

The final tests must assert both unauthenticated and permission-denied `null`
admin results redirect to `/login` and invoke none of the token, GitHub fetch,
validation-write, or audit dependencies.

Also cover `requireGitAdmin()` rejecting: the rejection must propagate under
the current server-action error policy and must invoke none of those privileged
dependencies. Do not convert an unavailable authorization lookup into a GitHub
validation-state failure.

**Verify:** run
`bun --cwd apps/git vitest run 'src/app/[locale]/-/[wsId]/admin-actions.test.ts' -t 'authorization'`.
Expected: null and rejected authorization cases prove zero privileged calls.

### Step 2: Gate authorization outside validation failure handling

Resolve `requireGitAdmin()` before entering the `try` that handles GitHub token,
repository, and validation-state failures. Redirect immediately when it returns
`null`. Only an already-authorized actor may enter either the successful
validation write or its failure write.

Preserve the current authorized semantics:

- token/repository success stores a non-null validation timestamp, clears the
  error, records the authorized actor's audit event, and redirects with
  `validated=1`;
- missing configuration or GitHub failure stores a sanitized error with null
  validation timestamp and redirects to the current error envelope;
- a validation-state writer failure remains best-effort in the failure branch.

Do not change the other server actions merely because they also redirect inside
`try`; this plan fixes the branch that performs a privileged catch-side write.

**Verify:** run the full focused action command from the command table.
Expected: unauthorized redirects/rejections remain outside the validation
catch, while the authorized success/failure cases retain their response paths.

### Step 3: Complete the action matrix

Add tests for authorized success, missing installation token, failed GitHub
fetch, and validation-writer failure. Assert unauthorized cases never mutate;
assert authorized operational failures still update validation state exactly
once with sanitized messages and never expose credential data.

**Verify:** run
`bun --cwd apps/git vitest run 'src/app/[locale]/-/[wsId]/admin-actions.test.ts' -t 'authorized validation'`.
Expected: success and operational-failure cases pass with exactly the intended
validation/audit calls.

### Step 4: Run all required gates

Run the focused/full Git tests, Git typecheck/build, `bun check`, and
`git diff --check`. Only the two in-scope files and advisor status row may
differ.

## Test plan

- No actor and non-admin actor: login redirect, zero privileged calls.
- Rejected authorization lookup: propagated failure, zero privileged calls.
- Authorized success: validation timestamp, audit, success redirect.
- Authorized no-token/GitHub failure: one sanitized failure-state write.
- Validation-state write failure: current safe redirect/error behavior remains.
- Redirect/control-flow sentinel is never classified as a GitHub failure.

## Done criteria

- [ ] Authorization completes before any Git validation `try`/catch can write.
- [ ] Unauthorized calls cannot reach token, network, validation-state, or audit
      operations.
- [ ] Authorized success and operational failure behavior is covered and
      preserved.
- [ ] Focused/full tests, typecheck, build, `bun check`, and whitespace gates
      pass.
- [ ] No credential, database, repository-registration, or public-copy scope
      changed.

## STOP conditions

Stop if `requireGitAdmin` no longer represents the complete Git management
permission, Next redirect behavior differs from the test sentinel, fixing the
mutation requires changing credential persistence or schema, a mandatory build
hits a repeated environment-only failure, or any other gate fails twice after
one reasonable correction.

## Maintenance notes

Authorization and framework redirects should sit outside catch blocks that
perform privileged failure bookkeeping. Review new server actions for the same
control-flow shape whenever a catch path writes operator state.
