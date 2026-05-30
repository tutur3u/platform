---
name: tuturuuu-e2e-auth-debugging
description: Tuturuuu local E2E authentication debugging guidance. Use when Playwright, native-machine E2E runs, dev-session, guest access, onboarding redirects, app-session verification, rate-limit tests, or Docker E2E parity checks fail.
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

## Native E2E First

For local E2E debugging and patch iteration, run the web app and Playwright on
the native machine. Do not use `bun test:e2e`, `bun --cwd apps/web test:e2e`,
or `bun test:e2e:web:docker` as the first debugging path; those commands build
and run the production-style Docker web stack and are slower to patch.

Use Docker-backed web E2E only when the user explicitly asks for Docker or CI
parity, or when the suspected bug is specific to the production Docker runtime.
If a Docker web E2E run is already in progress and the task is local patch
debugging, stop it before starting the native workflow.

The native workflow still uses local Supabase. Keep all E2E origins local and do
not point browser tests at a cloud Supabase project.

## Native Run Shape

1. Start or reset the local Supabase stack with the database package scripts.
2. Start `apps/web` natively with the local E2E environment. For a native server,
   server-side Supabase URLs should resolve to `http://127.0.0.1:8001`, not
   Docker-only `host.docker.internal`.
3. Run the focused Playwright spec directly from `apps/web` against the native
   server:

   ```bash
   bunx playwright test e2e/<focused-spec>.spec.ts --project=chromium
   ```
4. Keep the native server logs visible while patching, and stop the server after
   verification.

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
bunx playwright test e2e/<focused-spec>.spec.ts --project=chromium
```

Run the Playwright command from `apps/web` with the same local E2E environment as
the native web server. If CI parity is required separately, run the Dockerized
E2E command only after the native failure is understood or fixed.
