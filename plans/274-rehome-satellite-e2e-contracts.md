# Plan 274: Re-Home Hard-Cutover Satellite E2E Contracts

> **Executor instructions:** Move each `TODO(#4956)` browser contract to the
> app that now owns the route/page, give Finance and Teach bounded Playwright
> harnesses, enroll Contacts plus the new satellite lanes in canonical CI, and
> delete Web skips only after the destination cases pass. Keep Web-owned API and
> cron coverage in Web.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/web/e2e apps/web/src/__tests__/satellite-app-session.test.ts apps/inventory/e2e apps/inventory/playwright.config.ts apps/finance/e2e apps/finance/playwright.config.ts apps/finance/package.json apps/teach/e2e apps/teach/playwright.config.ts apps/teach/package.json apps/contacts/e2e apps/contacts/playwright.config.ts apps/contacts/package.json .github/workflows/e2e-tests.yaml scripts/ci/e2e-image-bundle.js scripts/ci/e2e-image-bundle.test.js scripts/ci/check-workflow-config.test.js bun.lock tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — obtain Finance/Inventory, Teach, Contacts,
  Mail lockfile, and E2E workflow/helper ownership transfer
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** architecture / E2E ownership / CI
- **Depends on:** exact destination-app, `bun.lock`, and E2E workflow transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Eight Web E2E files document a hard-cutover mismatch. Eleven Finance,
Inventory, Teach, and Contacts cases are permanently skipped because Web's
Docker suite does not start their live owners, while a Contacts Playwright suite
already exists but is not enrolled in canonical CI. These tests look present
yet can never protect the production browser/session boundary.

## Current state and exact contract

- The `TODO(#4956)` inventory is exactly eight Web files. Seven contain eleven
  `test.skip` cases: two Inventory checkout cases; five Finance wallet/debt/
  permission cases; two Teach privacy/authorization cases; and two Contacts
  recurring-calendar cases. `post-email-queue-production-scale.spec.ts` keeps
  live Web API/cron coverage but omits the now-Contacts-owned Posts UI assertion.
- Inventory already has `playwright.config.ts`, a `test:e2e` script, and a
  canonical workflow job. Contacts already has config, script, helpers, and
  `group-posts.spec.ts`, but no workflow invocation.
- Finance and Teach have neither Playwright config nor `@playwright/test`.
  Add it with workspace package-manager commands, producing only their manifest
  entries and the expected lockfile change. Add `test:e2e` scripts with the
  package manager manifest command; do not hand-edit dependency declarations.
- Create app-local configs modeled on Contacts for one worker, local Supabase,
  deterministic ports (`7808` Finance, `7813` Teach), trace-on-first-retry,
  screenshots on failure, and `forbidOnly` in CI. Destination suites must not
  call Web-only `/api/auth/dev-session`, `/api/v1/users/me/profile`, or the Web
  process's in-memory rate-limit reset.
- Add one host-neutral local-satellite actor fixture under
  `apps/web/e2e/helpers/satellite-app-session.ts`, the existing helper location
  already consumed by Inventory. It must refuse non-local app or Supabase
  origins; create a unique local GoTrue user through the local Admin Auth
  endpoint with the local Supabase secret key; verify/create its public profile
  row; sign `APP_SESSION_COOKIE_NAME` and `WEB_APP_SESSION_COOKIE_NAME` with
  `createAppSessionToken` for the explicit target app and local coordination
  secret; expose authorization headers plus Playwright cookies; and delete the
  Auth/profile fixture in `finally`. Destination specs retain their own
  workspace/membership/permission fixtures.
- Replace `resetAppRateLimitStateForTests` in moved cases with a unique
  deterministic local test IP in both `x-forwarded-for` and
  `cf-connecting-ip`. Each test gets a distinct IP namespace and each job starts
  a fresh satellite process, so no Web-process reset is required. The helper
  must reject cloud origins and never accept production credentials.
- Move/rewrite each skipped case at its live origin. Preserve its assertions,
  auth actor, tenant isolation, cleanup, and local-only safety. Do not merely
  change `test.skip` to `test` in Web. For Posts, retain Web API/cron assertions
  and add only the omitted UI assertion to Contacts.
- Add bounded canonical workflow jobs for Contacts, Finance, and Teach using
  the existing prepared Supabase image, retrying Bun setup action, dependency
  build filters, Chromium install, app-local command, always-stop cleanup, and
  seven-day failure artifacts. Jobs must not run on `production`. Preserve the
  workflow's existing trigger contract; per-job changed-path selection is not
  part of this plan because GitHub Actions has no native job-level `paths` key.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, `$using-git-worktrees`, and
`$tuturuuu-commit`. Read root AGENTS, all eight source specs, destination app
configs/AGENTS, E2E helpers, the complete workflow, and active ownership notes.
Obtain every named transfer before editing. Run `bun setup` immediately in the
isolated worktree. Never use production credentials or production data.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Inventory | `bun --cwd apps/inventory test:e2e -- --reporter=line` | existing cache suite plus both moved checkout cases pass locally |
| Finance | `bun --cwd apps/finance test:e2e -- --reporter=line` | five moved finance cases pass against Finance origin |
| Teach | `bun --cwd apps/teach test:e2e -- --reporter=line` | both moved education cases pass against Teach origin |
| Contacts | `bun --cwd apps/contacts test:e2e -- --reporter=line` | existing group-post plus recurring-calendar and Posts UI cases pass |
| Actor fixture | `bun --cwd apps/web vitest run src/__tests__/satellite-app-session.test.ts` | local-origin, token/cookie/header, profile, cleanup, and cloud-refusal cases pass without live services |
| Retired skips | `rg -n 'TODO\(#4956\)|test\.skip' apps/web/e2e/{finance-permission-boundaries.noauth.spec.ts,inventory-simulated-checkout.noauth.spec.ts,post-email-queue-production-scale.spec.ts,user-group-session-calendar.spec.ts,user-group-storage-ai-boundaries.noauth.spec.ts,workspace-debt-loans-private.spec.ts,workspace-quiz-answers-private.noauth.spec.ts,workspace-wallets-private.spec.ts` | no output; exit 1 after scoped migration |
| Workflow contracts | `node --test scripts/ci/e2e-image-bundle.test.js scripts/ci/check-workflow-config.test.js` | image and workflow policy suites pass with all four satellites enrolled |
| Types | `bun run --cwd apps/inventory type-check && bun run --cwd apps/finance type-check && bun run --cwd apps/teach type-check && bun run --cwd apps/contacts type-check` | all exit 0 |
| Repository | `bun check && git diff --check` | canonical gates pass; whitespace output is empty |

## Scope

**In scope:** the eight Web E2E specs only to move/delete the stranded cases;
one host-neutral local actor fixture under Web E2E helpers plus its Web unit
test; destination E2E specs/configs/helpers; Finance/Teach Playwright dependency and scripts via
Bun plus `bun.lock`; bounded Contacts/Finance/Teach jobs in the existing E2E
workflow; narrowly required E2E image/workflow contract tests.

**Out of scope:** production app/API behavior, changing permissions to make a
test pass, moving still-live Web API/cron coverage, deployment/cutover claims,
browser tests outside `TODO(#4956)`, broad workflow redesign, production
credentials, or merging unrelated satellite migrations.

## Steps

1. Inventory all eight TODO files and record a one-to-one matrix of eleven
   skipped cases plus the Posts UI assertion to Inventory (2), Finance (5),
   Teach (2), and Contacts (2 plus Posts UI). Prove each destination origin owns
   the exercised route/page before editing.
2. Establish Finance and Teach app-local Playwright configs/scripts/dependencies
   using Bun. Reuse the bounded Contacts/Inventory conventions and safe local
   Supabase environment; add no secrets. Implement and unit-test the exact
   local satellite actor fixture above, including origin refusal, Auth/profile
   creation, target-app token claims, cookies/headers, and cleanup. Extend
   shared image helpers only when required and cover every new app name.
3. Move or rewrite each case at the destination. Preserve setup/cleanup and
   exact authorization/content assertions. Keep Web-owned post-email API/cron
   assertions in Web while adding the Contacts Posts UI case. Replace every Web
   dev-session/profile/reset dependency with the local actor fixture and a
   unique test IP; assert no request is sent to localhost port 7803.
4. Run each destination suite locally and require green proof before deleting
   its Web skip/TODO block. The final retired-skips command must have no output.
5. Add three bounded workflow jobs with correct build filters, browser install,
   Supabase lifecycle, artifacts, branch conditions, and timeouts. Extend workflow
   contract tests so removing any enrolled satellite or failure artifact fails.
6. Run workflow tests, four app typechecks, `bun check`, whitespace, lockfile
   scope, and exact-diff review. Builds are not mandatory because production app
   source/dependencies beyond the test runner do not change; run a destination
   build if its manifest/config causes type-resolution drift.

## Done criteria

- [ ] All eleven formerly skipped contracts and the omitted Posts UI assertion
      execute at their canonical satellite origins.
- [ ] No scoped `TODO(#4956)` or `test.skip` remains in Web; Web-owned API/cron
      coverage is retained.
- [ ] Inventory, Finance, Teach, and Contacts Playwright suites are locally
      runnable and canonically enrolled with bounded CI/artifacts.
- [ ] Dependency/lockfile changes are limited to Playwright support for Finance
      and Teach, and all focused/type/repository/whitespace gates pass.

## STOP conditions

Stop on missing ownership/lockfile/workflow transfer, a case whose live owner
cannot be proven, a destination requiring production credentials, an assertion
that passes only after changing product authorization, unavailable safe local
fixture data, CI budget requiring silent coverage removal, or any mandatory
gate failing twice.

## Maintenance notes

After a hard cutover, browser contracts belong to the live origin. A skipped
test in the former host is migration debt, not coverage; future cutovers should
move the test and enroll the destination before deleting the old route/page.
