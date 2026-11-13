---
name: verify-web
description: Start apps/web and verify it the way a user would. Doctor checks that the English landing hero renders. Drive uses the existing Playwright harness. Use when verifying apps/web behavior, a public route, or a local smoke check.
---

# Verify apps/web

Confirm `apps/web` is serving and a real page renders. Stay on loopback or `*.localhost`. Never point this skill at production, and never use production credentials.

## Read first

- `apps/web/package.json` scripts `dev:app`, `build`, `start:app` (port `7803`)
- `portless.json` app `apps/web` name `tuturuuu`
- `apps/web/playwright.config.ts` and `apps/web/e2e/helpers/environment.ts`
- `apps/web/e2e/public-marketing-routes.noauth.spec.ts` (public landmark and product pages)
- `apps/docs/build/development-tools/development.mdx` (Portless, and the ban on local production builds)
- `apps/docs/build/development-tools/local-e2e.mdx` (one canonical stack per host on `:7803` and Supabase `:8001`)
- `features/README.md` in this skill

## Launch

Prefer a production server when a production build is already on disk: `apps/web/.next/BUILD_ID`, `routes-manifest.json`, and `required-server-files.json`. Doctor then runs `next start -p 7803` from `apps/web`. It never runs `next build`.

On an agent laptop, do not create that build. `AGENTS.md` and the development doc forbid `next build` here. Production-mode smoke of an exact commit is the CI preview deployment. With no production build, Doctor starts `next dev -p 7803 --turbopack` and says so.

Doctor binds `127.0.0.1` directly. It does not call Portless, so it does not take `https://tuturuuu.localhost`. The child env is the local E2E loopback pair from `scripts/e2e-local-environment.js`: web `http://127.0.0.1:7803`, Supabase `http://127.0.0.1:8001`. Parent shell secrets are not copied in.

Install dependencies once with `bun install --frozen-lockfile` from the repo root. Do not run `bun setup`.

`apps/web` imports `@tuturuuu/types`, `@tuturuuu/supabase`, and `@tuturuuu/internal-api` from their `dist` exports. A fresh worktree has no `dist`. The native e2e launcher builds those three packages once before `next dev`. Do that, and do not start a package watch:

```bash
for pkg in types supabase internal-api; do
  (cd "packages/$pkg" && bun run build)
done
```

Two copies can listen at once only on different ports. Playwright's guard allows web origins `http://127.0.0.1:7803`, `http://localhost:7803`, `https://tuturuuu.localhost`, and `https://tuturuuu.localhost:1355`. A second direct port is invisible to the harness. Portless name `tuturuuu` is a single route; a second `bun dev` for `apps/web` fights that hostname. The canonical `scripts/thanh-e2e` lane refuses to start when `:7803` or the Supabase port block is taken, so only one of those stacks runs per machine.

## Doctor

Model-free. Exit 0 means the server is up and `GET /en` returns HTTP 200 whose body contains the landing hero text `Your Team.`

```bash
node .agents/skills/verify-web/scripts/doctor.mjs
```

Cold `next dev` can take several minutes before the first HTML exists. Doctor waits up to 8 minutes while the port is closed or the response is not HTTP 200. An HTTP 200 that does not contain the landmark fails immediately. It records pid, start time, port, and the `next` binary in `tmp/verify-web/state.json` (gitignored) and appends stdout to `tmp/verify-web/web.log`. A later Doctor reuses that process. `node .agents/skills/verify-web/scripts/doctor.mjs --restart` stops it first, then starts again.

`VERIFY_WEB_MODE=start` refuses to run when the production build files are missing. `VERIFY_WEB_MODE=dev` forces the dev server. `VERIFY_WEB_PORT` changes the port. If that port is held by any other pid, Doctor exits 1 and does not kill it.

## Drive

Exercise one feature with the Playwright project that already exists. Run Doctor first so the server is listening. From `apps/web`, public pages need no Supabase data:

```bash
env -u DATABASE_URL -u DIRECT_URL -u POSTGRES_URL -u SUPABASE_URL -u SUPABASE_SERVER_URL \
  BASE_URL=http://127.0.0.1:7803 \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8001 \
  bunx playwright test e2e/public-marketing-routes.noauth.spec.ts \
  --project=chromium-no-auth \
  --grep "renders product route /en/products/tasks" \
  --timeout=180000
```

`globalSetup` calls `assertSafeE2EEnvironment()`. A cloud Supabase URL or a `BASE_URL` outside the allowlist aborts the run. Install the browser from `apps/web`, so the revision matches that app's Playwright: `cd apps/web && bunx playwright install chromium`. A root `bunx playwright install` can download a different revision, and the test then fails with "Executable doesn't exist". Unset `CI` for a local drive. When `CI` is set, this config retries twice.

Authenticated specs (`--project=chromium`) run `e2e/auth.setup.ts`, write `e2e/.auth/user.json`, and need the local Supabase stack from the database package. Skip them when Docker and Supabase are down. Signed-in checks against production are manual. Do not perform them here.

The feature pages in `features/` name the spec to run.

## Evidence

Doctor prints `PASS` or `FAIL`, the URL, HTTP status, whether `Your Team.` was present, the `<h1>` text, mode, pid, and port. Playwright writes `apps/web/test-results/` and `apps/web/playwright-report/` (both gitignored). Server logs stay in `tmp/verify-web/web.log`. Quote Doctor's stdout in the PR body when the skill itself changes.

## Cleanup

Stop only the process recorded in `tmp/verify-web/state.json`. The script checks pid, `ps` start time, and that the command is the `next` binary and port it launched. It signals that process group. It never uses `pkill`, `killall`, or a process-name match.

```bash
node .agents/skills/verify-web/scripts/cleanup.mjs
```

If the pid was reused or the command does not match, cleanup deletes the stale state file and leaves the process running.

## Gotchas

- `/en` is the Doctor route because the hero string `Your Team.` exists only as `landing.hero.title.line1` in `apps/web/messages/en.json`. The hero is server-rendered into the HTML. A direct `GET /en` answers 307 to `/` and sets `NEXT_LOCALE=en`. Doctor follows that redirect. `/` rewrites to the English page, and the final response is HTTP 200.
- Playwright's default timeout is 60s and the dev server compiles a route on first hit. Pass `--timeout=180000` for a route Doctor has not already compiled.
- `bun test:e2e` at the repo root and `bun test:e2e:web:docker` are the wrong loop for a local patch. Docker web E2E is paused. Use the `bunx playwright test` command above against the server Doctor started.
- `auth.noauth.spec.ts` resets rate-limit rows in local Supabase in `beforeEach`. Do not run it without `127.0.0.1:8001`.
- `e2e/navigation.spec.ts` is `test.fixme`. A green Doctor does not mean the workspace shell navigates.
- Missing `node_modules` is an install problem, not a cue to build the app.
- This machine may sleep. Re-run Doctor after wake. If the pid is dead, Doctor starts a new server. If you were interrupted, continue from the last commit, then Doctor again.
