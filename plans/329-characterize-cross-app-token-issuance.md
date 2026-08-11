# Plan 329: Characterize Cross-App Token Issuance at the HTTP Boundary

> **Executor instructions:** Add deterministic characterization tests for the
> live cross-app credential route and its shared issuer. Do not change runtime
> behavior, token contents, database functions, or route ownership. If a test
> exposes a security policy decision, stop and report it as a separate finding.
>
> **Drift check (run first):**
> `git diff --stat 44742d2ced..HEAD -- apps/web/src/legacy-api-routes/auth/generate-app-tokens/route.ts apps/web/src/legacy-api-routes/auth/generate-app-tokens/route.test.ts apps/web/src/app/api/auth/generate-app-tokens/route.ts packages/auth/src/cross-app/index.ts packages/auth/src/cross-app/index.test.ts apps/tanstack-web/migration/route-manifest.json`
> Stop on authentication, token parameter, response, wrapper, or shared-issuer
> drift.

## Status

- **Execution status:** TODO — no active exact-path owner
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** tests / security
- **Depends on:** none
- **Planned at:** commit `44742d2ced`, 2026-08-12

## Why this matters

`/api/auth/generate-app-tokens` mints bearer credentials across applications,
but neither its HTTP contract nor the shared issuer has focused tests. Existing
pgTAP proves a fixed database call, not authentication ordering, JSON failure
mapping, target/expiry forwarding, issuer failures, or the live response. A
credential boundary can therefore drift while the canonical suite remains
green.

## Current state and exact contract

- `apps/web/src/legacy-api-routes/auth/generate-app-tokens/route.ts:6-54`
  creates the session client, resolves the authenticated user, parses JSON,
  forwards `targetApp` plus `expirySeconds` (default 300) to
  `generateCrossAppToken`, and returns `{ token }` or a sanitized error.
- The auth failure at lines 14-16 returns 401 before request-body parsing.
  Missing truthy `targetApp` at 22-26 returns 400. A falsey issuer result at
  37-42 returns 500; thrown errors at 47-52 map to a separate generic 500.
- `packages/auth/src/cross-app/index.ts:15-62` performs its own
  `supabase.auth.getUser()`, passes only the verified user ID and optional email
  session metadata to `generate_cross_app_token`, and converts auth/RPC/thrown
  failures to `null`.
- `apps/web/src/app/api/auth/generate-app-tokens/route.ts:1-5` is generated and
  re-exports the legacy POST. No Rust handler owns this path. The TanStack
  manifest records the legacy source at
  `apps/tanstack-web/migration/route-manifest.json:553-557`.
- Use the mock/request construction in
  `apps/web/src/legacy-api-routes/cli/auth/start/route.test.ts:1-44` as the Web
  route-test exemplar. Tests must use clearly synthetic token markers and never
  read, print, snapshot, or persist real credentials.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/web vitest run src/legacy-api-routes/auth/generate-app-tokens/route.test.ts` | complete HTTP matrix passes with fake dependencies |
| Issuer tests | `bun --cwd packages/auth vitest run src/cross-app/index.test.ts` | auth, payload, metadata, RPC, and exception matrix passes |
| Types | `bun --cwd apps/web run type-check && bun --cwd packages/auth run type-check` | both exit 0 |
| Wrapper | `bun web:api-routes:check` | generated wrapper remains current; no source is regenerated |
| Runtime immutability | `git diff --exit-code -- apps/web/src/legacy-api-routes/auth/generate-app-tokens/route.ts apps/web/src/app/api/auth/generate-app-tokens/route.ts packages/auth/src/cross-app/index.ts apps/tanstack-web/migration/route-manifest.json apps/tanstack-web/migration/route-overrides.json` | no runtime or migration-artifact diff |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only the two new test files and plan status changed |

## Suggested executor toolkit

- Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`.
- Do not load or inspect environment credentials; all Supabase/token behavior is mocked.

## Scope

**In scope:** create
`apps/web/src/legacy-api-routes/auth/generate-app-tokens/route.test.ts` and
`packages/auth/src/cross-app/index.test.ts`; plan status.

**Out of scope:** any runtime edit; target-app allowlisting; expiry validation;
token format/session metadata changes; database migrations or pgTAP changes;
moving the legacy route first-class; editing the generated wrapper; Rust or
TanStack artifacts; logging changes; live network/provider/Supabase calls.

## Git workflow

- Branch: `test/cross-app-token-issuance` is not an accepted prefix; use
  `chore/cross-app-token-issuance-tests` in an isolated worktree and run
  `bun setup` immediately.
- Commit: `test(auth): characterize cross-app token issuance`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

### Step 1: Characterize the HTTP route

Mock `createClient`, `resolveAuthenticatedSessionUser`, and
`generateCrossAppToken`. Cover:

1. client creation happens first and its exact client reaches auth resolution;
2. auth error and absent user each return 401 `{ error: 'Unauthorized' }`, do
   not parse the body, and never invoke issuance;
3. valid JSON with absent/falsey `targetApp` returns the exact current 400 and
   never invokes issuance;
4. `{ targetApp }` forwards the same client, target, origin `'web'`, and default
   expiry 300;
5. explicit `expirySeconds` is forwarded unchanged and unknown fields are
   ignored under the current contract;
6. falsey issuer results return the current 500
   `{ error: 'Failed to generate token' }`;
7. malformed JSON, non-destructurable bodies, client/auth exceptions, and
   issuer exceptions return 500 `{ error: 'Internal server error' }`;
8. success returns 200 `{ token: <synthetic marker> }`.

Spy on `console.*` only to prevent the synthetic marker from appearing in log
arguments; do not snapshot the token response or error objects.

**Verify:** run Route tests; all cases pass against the unchanged handler.

### Step 2: Characterize the shared issuer

Build a minimal fake `TypedSupabaseClient`. Cover auth error/missing user (null,
no RPC), user with email (exact email-only `p_session_data`), user without email
(null metadata), exact user/origin/target/expiry RPC arguments, RPC failure,
thrown auth/RPC dependencies, and synthetic success return. Assert failures do
not leak token/session material through test logs.

**Verify:** run Issuer tests; all cases pass without environment or network access.

### Step 3: Prove test-only scope

Run both suites and typechecks, wrapper consistency, runtime immutability,
`bun check`, scope, and whitespace gates. Do not run route generators because
no runtime route moved.

If the existing tests reveal that arbitrary targets or expiry values are unsafe
or conflict with a documented caller, record a separate correctness/security
finding. Do not silently tighten this characterization plan.

## Test plan

- Web handler: exact ordering, no body parse before auth, all status/body
  branches, default/custom forwarding, thrown dependencies, no token logging.
- Shared issuer: verified actor, email-only metadata, exact RPC contract,
  null/error/throw behavior, synthetic success.
- Every dependency remains a fake; no real credential, environment file,
  Supabase process, or network call is permitted.

## Done criteria

- [ ] HTTP auth, parse, forwarding, failure, and success branches are characterized.
- [ ] Shared issuer actor/metadata/RPC/error behavior is characterized.
- [ ] Tests contain only synthetic token markers and assert no token logging.
- [ ] Runtime handlers, generated wrapper, database, Rust, and TanStack artifacts are unchanged.
- [ ] Focused suites, both typechecks, wrapper check, `bun check`, scope, and whitespace pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if any runtime behavior must change to make the tests pass; a Rust handler
now owns the path; the generated wrapper/source ID changed; a supported caller
requires a policy decision about targets or expiry; an active exact test/runtime
owner appears; or a required gate fails twice.

## Maintenance notes

When the production handler later changes substantially, move it and this test
first-class under `apps/web/src/app/api/auth/generate-app-tokens/`, delete the
legacy source/wrapper, update the TanStack source ID, and run the full Web route
migration duties. This plan intentionally freezes the current boundary first.
