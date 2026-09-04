# Plan 109: Reserve External-Project Email Budget Atomically

> **Executor instructions:** Make the documented monthly external-project email
> ceiling concurrency-safe and idempotent before any provider dispatch. Preserve
> the existing credential, payload, recipient-count, escaping, and mail-audit
> boundaries. Do not weaken the cap after a provider result becomes ambiguous.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/web/src/app/api/v1/workspaces/[wsId]/external-projects/emails' apps/web/src/lib/external-projects/email-budget.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration tmp/agent-coordination`
> Stop on external-project email, mail-audit, migration/type, or route-artifact
> drift, and stop until the named owners transfer the exact paths.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** security
- **Depends on:** Richfield external-project, G22 route-artifact, and generated migration/type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The route promises a hard monthly cost ceiling, but it checks a count snapshot
and sends later. Two calls observing 799 attempts can both dispatch and exceed
the 800-send allowance. A compromised external app or retry storm can amplify
that check-then-act race at the cost boundary.

## Current state

- `email-budget.ts:45-87` derives allowance from a standalone exact count of
  monthly `email_audit` rows.
- `emails/route.ts:98-128` checks that snapshot and invokes
  `sendWorkspaceEmail` in a later operation.
- `emails/route.test.ts:191-217` covers sequential 799/800 cases only.
- `tmp/agent-coordination/20260723-213000-codex-richfield-external-cms.md`
  remains `working` over the external-project surface. Generated migration and
  type paths also have nonterminal owners, and the working G22 lane owns the
  required TanStack route override and manifest artifacts.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Re-read the Web and database AGENTS files.
Obtain an explicit transfer from the Richfield and generated-type owners before
changing source, and from G22 before refreshing route artifacts. Create a
uniquely named migration only after those transfers.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Create migration | `bun sb:new reserve_external_project_email_budget` | one additive migration |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | reservation concurrency/privilege tests pass |
| Local apply | `bun sb:up` | migration applies locally |
| Regenerate DB types | `bun sb:typegen` | only expected generated type changes |
| Route tests | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/external-projects/emails/route.test.ts'` | sequential, duplicate, and overlapping cases pass |
| Migration tracking | `bun migration:tanstack:manifest && bun migration:tanstack:check` | refreshed route metadata is valid |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- the external-project email route/test and budget helper
- one additive reservation migration and
  `apps/database/supabase/tests/external-project-email-budget.sql`
- generated database types
- exact Web-to-Rust/TanStack route-tracking artifacts required by current HEAD
- `plans/README.md` only for status

Do not change external-app credential issuance, general email-service behavior,
recipient limits, HTML escaping, or unrelated notification budgets.

## Git workflow

Use branch `fix/external-project-email-budget` in an isolated worktree and run
`bun setup`. Commit `fix(email): reserve external project budget atomically`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Define the reservation contract

Accept an inert UUID `Idempotency-Key` header. During the compatibility phase,
generate a fresh server request UUID when the header is absent so existing
external callers keep working and still reserve atomically; only supplied keys
deduplicate retries. Inventory missing-key telemetry, coordinate the Richfield
caller update under its active lane, and enforce the header in a later rollout
only after every supported caller is verified. Add a
private monthly counter keyed by `(ws_id, billing_month)` and a reservation
table keyed by `(ws_id, app_id, request_id)` with billing month and state
(`reserved`, `attempted`, `completed`, `failed`), terminal status/envelope,
audit/message references, and timestamps. A duplicate supplied key must return
the recorded terminal result or the same in-progress conflict; it must never
dispatch twice.

### Step 2: Reserve under one database serialization boundary

Create a service-role-only RPC that serializes by workspace plus UTC billing
month, returns an existing reservation for retries, and increments the monthly
counter with the reservation only when `used_count < 800`. On the first
reservation for a month, seed `used_count` from the existing external-project
`email_audit` count inside the same transaction so a mid-month rollout neither
forgets nor double-counts historical attempts; after seeding, the counter is the
admission source of truth. Revoke execute from `PUBLIC`, `anon`, and
`authenticated`; set an explicit search path. Add a real two-connection
database test proving two final-slot requests yield one reservation and one
exhausted result.

### Step 3: Settle conservatively around provider dispatch

Move a reservation to `attempted` immediately before calling the mailer. Once
dispatch starts, retain that unit even on timeout or ambiguous failure; a retry
must reconcile the stored attempt rather than spend another unit. Store the
available audit/message identifiers on `completed`. Store a sanitized terminal
status and the current 502 envelope on `failed` for deterministic mailer
rejections, and replay that 502 without redispatch. Preserve the current
400/401/403/429/502 envelopes, adding a stable 409 response only for a duplicate
request whose original `attempted` outcome remains unresolved.

### Step 4: Prove authorization, cost, and retry behavior

Test malformed and absent idempotency keys, sequential 799/800 behavior,
duplicate replay before and after success, simultaneous final-slot requests,
deterministic mailer failure/replay, and an ambiguous provider result. Verify
unauthorized callers never reserve and retries with a supplied key never
dispatch twice. Prove two different external apps may independently use the
same request UUID without seeing or replaying each other's reservation result,
while both consume the shared workspace-month allowance.

## Done criteria

- [ ] The 800-attempt monthly ceiling holds under concurrent requests.
- [ ] One supplied idempotency key can cause at most one provider dispatch.
- [ ] Idempotency results are isolated by calling external app.
- [ ] Existing missing-key callers retain compatibility while telemetry supports later enforcement.
- [ ] Deterministic failures replay their stored 502; only unresolved attempts return 409.
- [ ] Mid-month rollout seeds prior audited attempts exactly once.
- [ ] Ambiguous attempts remain counted and observable rather than silently released.
- [ ] Reservation RPC privileges and cross-workspace isolation are tested.
- [ ] Database apply/tests, typegen, route tests, migration tracking, Web build, and repository gates pass.

## STOP conditions

Stop if ownership is not explicitly transferred, production already has a
different billing source of truth, missing-key compatibility cannot be
maintained during caller rollout, or historical audit semantics cannot be
reconciled without operator disposition.

## Maintenance notes

A budget check that is not also the reservation is advisory only. Keep billing
month normalization and the 800-unit invariant in one database-owned contract.
