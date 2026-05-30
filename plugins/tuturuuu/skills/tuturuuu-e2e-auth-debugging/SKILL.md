---
name: tuturuuu-e2e-auth-debugging
description: Tuturuuu local E2E authentication debugging guidance. Use when Playwright, dev-session, guest access, onboarding redirects, app-session verification, rate-limit tests, or local Docker E2E auth flows fail.
---

# Tuturuuu E2E Auth Debugging

## Core Workflow

Use this skill when an E2E or integration test fails around login, local
`dev-session`, onboarding redirects, guest access, app-session verification, or
rate-limit auth state.

Start by reading `AGENTS.md`, checking `git status --short`, and identifying
whether another coordination note owns the same E2E or auth files.

## Safety First

- Keep E2E helpers local-only. Do not relax production auth, onboarding,
  workspace, or rate-limit guards to make a test pass.
- Use `apps/web/e2e/helpers/environment.ts` and `assertSafeE2EEnvironment()` for
  tests that touch local Supabase or app coordination secrets.
- Use unique test emails and clean/reset only test-owned local state.
- Do not run long-running dev/build commands unless the user explicitly asks.

## Debugging Order

1. Read the failing spec and its helpers before changing app code.
2. Check whether the failure is at request setup, session creation, profile or
   workspace state, route middleware, or UI assertion.
3. Prefer a focused unit or route test for `dev-session`, app-session, or helper
   behavior before rerunning a full Playwright spec.
4. If the browser redirects to onboarding unexpectedly, inspect the generated
   user profile, default workspace, workspace membership, and any app-specific
   onboarded flags seeded by the local setup route.
5. For guest-access tests, verify both API permissions and the final URL/body
   assertions. Guests should receive only the intended workspace/task surfaces.
6. For rate-limit tests, reset generated reputation state with the existing
   helper instead of weakening limits.

## Common Files

- `apps/web/e2e/helpers/auth.ts`
- `apps/web/e2e/helpers/environment.ts`
- `apps/web/e2e/helpers/rate-limits.ts`
- `apps/web/src/app/api/auth/dev-session/route.ts`
- `apps/web/src/__tests__/dev-session-route.test.ts`
- app-specific `app/api/auth/verify-app-token/route.ts` and proxy auth tests

## Verification

Run the smallest checks that prove the failure mode:

```bash
bun --cwd apps/web test src/__tests__/dev-session-route.test.ts
bun --cwd apps/web test e2e/<focused-spec>.spec.ts
```

If the focused spec requires Dockerized local services and they are unavailable,
report that blocker with the route/unit tests that did pass.
