# Plan 087: Retire the Wallet Migration Writer

> **Executor instructions:** Replace the Finance wallet migration writer with
> the terminal decommission response already recorded by the Rust/OpenAPI
> contract. Do not preserve a hidden bulk-write escape hatch.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/finance/src/app/api/workspaces/[wsId]/wallets/migrate' apps/backend/api/openapi.yaml apps/backend/src/tests/g15.rs apps/backend/src`
> Stop on endpoint, response-contract, or Finance ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** MED
- **Category:** security / migration
- **Depends on:** Finance/Inventory migration owner releasing or transferring the exact route
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The live Finance PUT accepts arbitrary wallet objects from any workspace member
and bulk-upserts them with an admin client, bypassing `create_wallets`. The
registered backend contract already says this obsolete migration is disabled.

## Current state

- `apps/finance/.../wallets/migrate/route.ts:16-56` parses an untyped body,
  verifies membership only, spreads each wallet, and writes private rows.
- `packages/apis/src/finance/wallets/route.ts:323-388` is the maintained,
  permissioned, allowlisted wallet API.
- `apps/backend/api/openapi.yaml:7818-7838` specifies 410
  `MIGRATION_DISABLED` in development and 403 outside development.
- `apps/backend/src/tests/g15.rs:160-205` locks that backend behavior.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Obtain exact-path
transfer from `20260709-123138-claude-finance-inventory-migration.md`. Check
telemetry or documented clients; if a supported caller remains, stop and plan
its migration to the maintained wallet API first.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Finance test | `bun run --cwd apps/finance test -- 'src/app/api/workspaces/[wsId]/wallets/migrate/route.test.ts'` | decommission matrix passes |
| Finance typecheck | `bun run --cwd apps/finance type-check` | exit 0 |
| Finance build | `bun run --cwd apps/finance build` | exit 0 |
| Rust contract test | `cd apps/backend && cargo test --locked --lib g15 -- --nocapture` | existing parity remains green and nonzero matching tests run |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- Finance wallet-migration route and a colocated route test
- backend/OpenAPI files only if live inspection proves the recorded envelope
  differs; otherwise they are verification-only
- `plans/README.md` only for status

Do not change the maintained wallet CRUD API, wallet schema, or other migration
routes.

## Git workflow

Use branch `fix/retire-wallet-migration-writer` in an isolated worktree and run
`bun setup`. Commit `fix(finance): retire wallet migration writer`. Claim the
commit window before staging; do not push unless instructed.

## Steps

### Step 1: Prove the endpoint is obsolete

Confirm no supported repository caller and no approved external client remains.
Record the production/dev behavior from the backend contract. Stop if migration
traffic is still required; do not weaken the maintained wallet permission path.

### Step 2: Replace the writer with the terminal contract

Make PUT parse no body and perform no auth, membership, admin-client, or database
work. Match the registered environment-sensitive 410/403 JSON envelopes exactly
and preserve `Allow: PUT`/405 behavior for unsupported methods if the Finance
runtime owns that method handling.

### Step 3: Lock the no-write guarantee

Test development 410, production 403, unsupported method behavior, and a body
containing arbitrary wallet fields. Assert that no Supabase client or mutation
is created in any case.

### Step 4: Verify parity

Run the Finance test/typecheck/build, the focused Rust contract test, and
`bun check`. Do not edit OpenAPI or Rust solely to create churn when parity
already exists.

## Done criteria

- [ ] The Finance endpoint can never write wallets.
- [ ] Its environment/status/body/method contract matches Rust/OpenAPI.
- [ ] No supported caller depends on the obsolete writer.
- [ ] Focused tests, Finance build, Rust parity, and repository gates pass.

## STOP conditions

Stop if route ownership is not transferred, a supported caller remains, the
backend contract has drifted, or a required gate fails twice.

## Maintenance notes

Obsolete migration endpoints should fail terminally and consistently across
live and migration-target runtimes; never leave membership-only admin writers.
