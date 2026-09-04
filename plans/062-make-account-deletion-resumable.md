# Plan 062: Make Account Deletion Resumable

> **Executor instructions:** Replace best-effort account teardown with a durable,
> idempotent deletion job that never reports success while paid/provider or
> workspace cleanup is incomplete.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/web/src/legacy-api-routes/v1/users/me/delete apps/web/src/app/api/v1/users/me/delete apps/web/src/app/api/cron/account-deletions apps/web/src/lib/account-deletion 'apps/web/src/app/[locale]/(marketing)/account/delete/page.tsx' 'apps/web/src/app/[locale]/(marketing)/account/delete/page.test.tsx' apps/web/messages/en.json apps/web/messages/vi.json apps/web/cron.config.json apps/web/vercel.json scripts/sync-web-crons.js scripts/web-crons.test.js apps/backend/src/users_me_delete.rs packages/internal-api/src/account-delete.ts packages/internal-api/src/account-delete.test.ts 'apps/tanstack-web/src/routes/$locale/account/delete.tsx' 'apps/tanstack-web/src/routes/$locale/account/delete.test.tsx' apps/tanstack-web/src/messages/en.json apps/tanstack-web/src/messages/vi.json apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on deletion, billing cleanup, Rust fallback, or migration ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** Correctness / Destructive workflow integrity
- **Depends on:** G22 generated migration-artifact ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Account deletion cancels provider subscriptions and seats before deleting the
auth user, but swallows provider failures. If auth deletion fails after provider
success, a live account loses entitlements; if provider cleanup fails, the user
is still deleted and paid resources can remain active. Workspace cleanup after
auth deletion is also best-effort while the API reports complete success.

## Current state

- `users/me/delete/route.ts:149-166` rechecks paid-workspace blockers once.
- Lines `168-205` run Polar seat/subscription cleanup concurrently, catch every
  error, and ignore the `Promise.allSettled` results.
- Lines `207-220` delete the auth user only after those irreversible external
  calls; failure returns 500 with already-applied side effects.
- Lines `223-245` swallow orphan-workspace deletion failures and still return
  `Account deleted successfully`.
- `apps/backend/src/users_me_delete.rs:1-35` owns GET only and must continue to
  return `None` for POST until an explicitly approved mutation port.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and the
nearest backend instructions. Do not start while G22 owns generated route or
database artifacts. Confirm Polar revoke idempotency and exact workspace-delete
foreign-key effects before selecting retry transitions.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Web tests | `bun run --cwd apps/web test -- 'src/app/api/v1/users/me/delete/route.test.ts' 'src/app/api/v1/users/me/delete/status/route.test.ts' 'src/app/api/cron/account-deletions/route.test.ts' 'src/lib/account-deletion/processor.test.ts' 'src/app/[locale]/(marketing)/account/delete/page.test.tsx'` | durable request/worker/UI cases pass |
| Internal API tests | `bun run --cwd packages/internal-api test -- src/account-delete.test.ts` | 202/status contract passes |
| TanStack UI test | `bun run --cwd apps/tanstack-web test -- 'src/routes/$locale/account/delete.test.tsx'` | pending/terminal/completed UX passes |
| Database reset | `bun sb:reset` | job migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | claim/state/idempotency tests pass |
| Database types | `bun sb:typegen` | generated types are current |
| Route wrappers | `bun web:api-routes:check` | moved route has no stale wrapper |
| Migration manifest | `bun migration:tanstack:manifest && bun migration:tanstack:check` | metadata is current |
| Backend tests | `cd apps/backend && cargo test --locked users_me_delete` | GET covered, POST still falls through |
| Backend gate | `bun check:backend` | all backend gates pass |
| Cron projection | `node scripts/sync-web-crons.js && node scripts/sync-web-crons.js --check` | live cron source and generated Vercel config agree |
| Cron registry test | `node --test scripts/web-crons.test.js` | cron synchronization contract passes |
| Localization | `bun i18n:sort && bun i18n:key-parity && bun i18n:namespace-check` | message files are sorted and parity/namespace checks pass |
| Typechecks | `bun run --cwd apps/web type-check && bun run --cwd apps/tanstack-web type-check && bun run --cwd packages/internal-api type-check` | all exit 0 |
| Repository gate | `bun check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| TanStack build | `bun run --cwd apps/tanstack-web build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Move the deletion route and new test to first-class `apps/web/src/app/api/**`;
  delete the legacy implementation/wrapper and re-key migration metadata
- A private deletion-job and per-operation state model, additive migration,
  pgTAP tests, and generated types
- `apps/web/src/lib/account-deletion/processor.ts` with a focused test
- `apps/web/src/app/api/cron/account-deletions/route.ts` and route test, protected
  by the same fail-closed `CRON_SECRET ?? VERCEL_CRON_SECRET` Bearer contract as
  `apps/web/src/legacy-api-routes/cron/process-topic-announcement-queue/route.ts`
- Add the every-ten-minutes job to authoritative `apps/web/cron.config.json`,
  regenerate `apps/web/vercel.json` with `scripts/sync-web-crons.js`, and retain
  the synchronizer assertion in `scripts/web-crons.test.js`
- Internal API response/status typing and tests
- Web and TanStack account-deletion pages plus focused tests; the TanStack page
  remains the migrated implementation and its page override note is refreshed
- English/Vietnamese message bundles for both apps, using the same
  `settings-account.delete-account-deletion-pending`,
  `settings-account.delete-account-deletion-manual-review`, and
  `settings-account.delete-account-deletion-support` keys
- `apps/backend/src/users_me_delete.rs` tests/comments only to preserve GET
  ownership and POST fallthrough; do not port the mutation in this plan

Do not change deletion eligibility policy, paid-tier definitions, user email
confirmation, unrelated Polar webhooks, or general workspace deletion UX.

## Git workflow

- Branch: `fix/resumable-account-deletion` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(account): make deletion resumable`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Persist one deletion workflow

Create a private job keyed by user with explicit `requested`, `cleaning`,
`ready_to_delete`, `completed`, and terminal/manual-review states. Persist one
operation row per seat, subscription, and owned workspace with a unique target
key, attempts, last error category, and completion timestamp. The request route
validates email/eligibility, inserts or returns the active job, and returns 202
with a stable job status; it does not perform unrecorded provider mutations.
Keep the durable subject UUID after auth deletion without a cascading foreign
key that would erase the audit/job record.

### Step 2: Claim and resume operations idempotently

Use a bounded server-only worker claim with lease expiry. Record each provider
operation before calling Polar, treat provider already-revoked/not-found as
success only when official client semantics confirm it, and persist completion
before advancing. Retry transient failures with bounded backoff; leave terminal
failures visible for operator action. Never delete the auth user while any
required operation is pending or failed. The cron route claims at most 25 jobs
per invocation and the processor uses bounded concurrency of five jobs; both
limits are constants with tests, not caller-selected inputs.

### Step 3: Order destructive local cleanup

After all provider operations are durably complete, transactionally remove
eligible non-personal workspaces/local relationships using an actor-validating
private operation. Immediately before `ready_to_delete`, call a private
`reconcile_account_deletion_inventory` transaction that locks the job and the
user's current membership/owned-workspace rows, re-runs the authoritative paid
seat/subscription/workspace inventory, and upserts any missing operation keys.
If it discovers anything new, atomically return the job to `cleaning`; the
worker may call `auth.admin.deleteUser` only after a subsequent reconciliation
returns `ready=true` and every operation is complete. Add a test where membership
or subscription state appears after the initial snapshot. Call auth deletion
last. Persist a pre-delete completion marker so retry after an ambiguous auth
response can safely confirm the user is already absent and finalize the job
without repeating cleanup.

### Step 4: Preserve migration and client contracts

POST returns `202 { jobId, status, statusToken }`, where `statusToken` is a
single-job high-entropy secret stored only as a hash and never logged. Add GET
`/api/v1/users/me/delete/status`, which accepts that token in an
`X-Account-Deletion-Status-Token` header, constant-time verifies its hash, and
returns only the matching job's public state
`requested|cleaning|ready_to_delete|manual_review|completed`; an authenticated
actor may also resume their own active/latest job before auth deletion, but the
endpoint never accepts a user ID. This token path deliberately remains usable
after `auth.admin.deleteUser` invalidates the session. Both deletion pages keep
the token in `sessionStorage`, poll the typed internal-API facade every two
seconds while pending, survive reload by resuming that job, clear the token at a
terminal state, show the error/support state for `manual_review`, and show the
existing success toast, sign out, and redirect only after observing
`completed`. Refresh the TanStack page override note. Move the Web mutation
route out of legacy; add explicit override/backlog entries for the moved
mutation, new status GET, and new cron route, regenerate the manifest, and prove
the Rust GET handler still returns `None` for POST.

## Test plan

pgTAP covers one active job per user, unique operation targets, claim leasing,
retry transitions, terminal failure, final inventory reconciliation,
status-token hashing/isolation, and local-cleanup rollback. Route/processor
tests cover email mismatch, paid blocker, duplicate POST, seat failure,
subscription failure, workspace failure, auth deletion failure, ambiguous
already-deleted user, newly discovered cleanup after the first inventory,
successful completion, and no success before every step. Web/TanStack UI tests
prove pending and manual-review states do not log out or redirect, reload resumes
polling, another job's/invalid token is denied, and only completed logs out.
Rust tests prove GET parity and POST fallthrough.

## Done criteria

- [ ] Every external/local deletion side effect has durable idempotent state.
- [ ] Auth deletion occurs only after required provider and workspace cleanup.
- [ ] Retries resume without duplicating provider operations or losing state.
- [ ] The API never reports completed deletion after a partial failure.
- [ ] Route/client/database/Rust tests, reset/typegen, migration/backend gates,
      typechecks, repository gate, build, and whitespace pass.

## STOP conditions

Stop if G22 ownership remains active, Polar revoke outcomes are not safely
classifiable for retry, deleting an owned workspace requires product/operator
choice, auth deletion cannot be safely confirmed after an ambiguous response,
or implementation would require weakening the current paid-workspace blocker.

## Maintenance notes

Account deletion is a saga across provider, database, and auth systems. Every
new cleanup target must join the durable operation inventory before the auth
user can be removed.
