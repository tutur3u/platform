# Plan 273: Characterize the TOTP HTTP Boundary

> **Executor instructions:** Add one focused route-contract suite for every live
> Web TOTP endpoint. Freeze current authentication, validation, provider,
> rate-limit, failure-accounting, and success behavior without changing the
> handlers or inventing a new MFA policy.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/web/src/legacy-api-routes/auth/mfa/totp apps/web/src/app/api/auth/mfa/totp apps/web/src/__tests__/totp-api-routes.test.ts apps/web/src/components/settings/account/totp-dialog.tsx packages/utils/src/abuse-protection tmp/agent-coordination`

## Status

- **Execution status:** TODO — no active exact-path owner; coordinate if shared
  auth or abuse-protection helpers must change
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** test coverage / authentication / Web API
- **Depends on:** none
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The production account-settings flow directly uses six TOTP handlers for list,
enroll, detail, delete, challenge, verification, and assurance level. They own
authentication, provider error mapping, throttling, and verification failure
accounting, but no test imports these handlers. A destructive authentication
regression can therefore leave the canonical Web suite green.

## Current state and exact contract

- The generated first-class files under `apps/web/src/app/api/auth/mfa/totp/**`
  export unchanged legacy handlers. Keep those wrappers and route ownership
  unchanged in this test-only plan.
- Collection GET lists the authenticated user's factors; POST enrolls TOTP with
  caller `friendlyName`. Item GET finds the requested TOTP factor or returns
  404; DELETE calls `unenroll` for the route factor ID.
- Challenge POST checks the IP challenge limit before auth/provider work,
  requires `factorId`, and calls `mfa.challenge`.
- Both verification POSTs check the IP verification limit before auth/provider
  work. Factor verification calls `challengeAndVerify`; challenge verification
  calls `verify`. Provider failure returns 400 and schedules exactly one
  `recordMFAVerifyFailure`; success schedules exactly one
  `clearMFAVerifyFailures`.
- Assurance GET calls `connection()`, authenticates, and returns
  `getAuthenticatorAssuranceLevel` data.
- Preserve current status/body mapping exactly in this characterization plan:
  anonymous/auth-error 401; missing required inputs 400; missing factor 404;
  rate limit 429 with `retryAfter`; Supabase MFA errors 400; thrown/unclassified
  errors sanitized to `{error:'Internal server error'}`, 500. Do not snapshot
  raw secrets, QR payloads, TOTP codes, or provider tokens.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-validation-offload`, and `$tuturuuu-commit`. Read root AGENTS, all
six legacy handlers, their generated wrappers, the TOTP dialog, and existing
Web auth-route test conventions. This is test-only: do not move/rewrite routes,
change provider calls, or update migration artifacts.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused TOTP routes | `bun --cwd apps/web vitest run src/__tests__/totp-api-routes.test.ts` | complete method/auth/provider/rate-limit matrix passes |
| Discovery | `bun --cwd apps/web vitest run --passWithNoTests` | new suite is discovered with the canonical Web tests |
| Web types | `bun run --cwd apps/web type-check` | exit 0 |
| Repository | `bun check && git diff --check` | canonical gates pass; whitespace output is empty |

## Scope

**In scope:** one new `apps/web/src/__tests__/totp-api-routes.test.ts` that
imports the legacy handlers and mocks Supabase/auth/abuse/Next connection
seams. A tiny test-only helper under the same test file is allowed.

**Out of scope:** modifying/moving the six handlers or generated wrappers;
changing TOTP validation, rate limits, error exposure, factor ownership, UI,
Supabase configuration, Rust/mobile MFA, route manifests, or production auth.

## Steps

1. Build a deterministic Supabase MFA mock exposing `listFactors`, `enroll`,
   `unenroll`, `challenge`, `challengeAndVerify`, `verify`, and
   `getAuthenticatorAssuranceLevel`. Mock session resolution, IP extraction,
   challenge/verify limit results, failure recording, success clearing, and
   `connection()` before importing handlers.
2. Cover factors GET/POST and item GET/DELETE for missing session/auth error,
   malformed JSON or required input, list/enroll/unenroll provider error,
   factor absent, exact provider arguments, and success envelopes.
3. Cover challenge and both verification routes for rate-limit denial before
   auth/provider calls, missing inputs, anonymous actor, trimmed code and exact
   unmodified IDs, provider rejection with one recorded failure, success with one clear,
   and thrown dependency errors sanitized to 500. Await scheduled mock promises
   so negative-call assertions are deterministic.
4. Cover assurance GET for `connection()`, anonymous, provider error, thrown
   error, and success. Add an import/source assertion that every generated
   wrapper still points to the tested legacy implementation.
5. Run focused/full Web tests, typecheck, repository, whitespace, and exact
   test-only scope gates. No production build is required because no route or
   app source changes.

## Done criteria

- [ ] Every live TOTP method has authenticated, denied, provider-error, thrown,
      and success coverage appropriate to its contract.
- [ ] Challenge/verification throttling and failure/clear side effects have
      exact ordering and negative-call assertions.
- [ ] Destructive unenrollment and factor lookup are covered with exact route
      IDs and provider calls.
- [ ] The change is test-only and focused/full Web, typecheck, repository, and
      whitespace gates pass.

## STOP conditions

Stop on an active exact-path owner, a test that requires live Supabase/auth,
need to change production route behavior, generated-wrapper drift, a discovery
configuration change outside Web, or any mandatory gate failing twice.

## Maintenance notes

This plan freezes the live contract; it does not endorse every current provider
error body or ordering choice. Promote policy changes separately after this
suite makes their compatibility impact visible.
