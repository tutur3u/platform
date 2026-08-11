# Plan 041: Enforce Profile-Link Submission Limits Atomically

> **Executor instructions:** Make link availability, profile mutation, and the
> submission record one database transaction. A full, expired, or revoked link
> must never create or update a workspace user.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/web/src/legacy-api-routes/v1/public/user-profile-links/'[code]'/submit apps/web/src/app/api/v1/public/user-profile-links/'[code]'/submit apps/web/src/features/user-profile-links apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on material profile-link, audit-RPC, schema, or ownership drift.

## Status

- **Execution status:** BLOCKED — the working G22 backend lane owns the shared route override and manifest artifacts
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / Correctness / Concurrency
- **Depends on:** G22 backend migration ownership release or explicit transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Anonymous profile links are documented as abuse-bounded by `max_uses`, expiry,
and revocation. Today the route checks a count view, mutates or creates a CRM
row, and only then best-effort inserts the count record. Concurrent requests or
a failed audit insert can bypass the limit and leave untracked workspace users.

## Current state

- `submit/route.ts:38-55` reads `is_full`, `is_expired`, and `is_revoked` from
  `workspace_user_profile_links_with_stats` before any write or lock.
- Lines 103-183 create/update the workspace user through admin RPCs; lines
  192-207 insert the submission afterward and deliberately swallow failure.
- Anonymous generic submissions always create a fresh workspace-user row.
- `20260615112900_workspace_user_profile_links.sql:162-195` derives `is_full`
  from `COUNT(submissions) >= max_uses`; it is not a reservation.
- `20260615201000_add_workspace_user_profile_links_requires_auth.sql:1-4`
  explicitly promises that no-auth abuse is bounded by these controls.
- A substantial legacy-route change must move to the first-class API tree and
  refresh TanStack migration tracking.
- The first-class target is an occupied generated wrapper and no override entry
  currently exists; replace the wrapper and create a first-class-source
  override rather than attempting a plain move or re-key.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$supabase-postgres-best-practices`, and `$tuturuuu-agent-coordination`. Inspect
the existing audit-actor RPC bodies and grants before designing the wrapper
transaction. Do not start while G22 retains generated-artifact ownership.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Database reset | `bun sb:reset` | migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | all pgTAP tests pass |
| Type generation | `bun sb:typegen` | generated types match local schema |
| Route tests | `bun --cwd apps/web vitest run 'src/app/api/v1/public/user-profile-links/[code]/submit/route.test.ts'` | all cases pass |
| Wrapper check | `bun web:api-routes:check` | exit 0 |
| Manifest | `bun migration:tanstack:manifest` | exit 0 |
| Migration check | `bun migration:tanstack:check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- One additive migration, focused pgTAP coverage, regenerated database types
- First-class submit handler and colocated route tests
- Matching TanStack override re-key and regenerated manifest

Do not redesign link creation UI, allowed-field vocabulary, avatar uploads,
email locking, or historical malformed-row cleanup beyond reporting it.

## Git workflow

- Branch: `fix/atomic-profile-link-submissions` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(contacts): enforce profile link limits atomically`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging and never stage coordination notes.

## Steps

### Step 1: Define one server-only transaction

Add a `private` function that resolves the link by code and locks its base row,
then rechecks revoked, expiry, and `max_uses` against submission count inside
the transaction. Validate mode, target, workspace, allowed submitted fields,
and the authenticated actor/email-lock contract before mutation. Revoke execute
from `PUBLIC`, `anon`, and `authenticated`; grant only `service_role`.

### Step 2: Commit profile and provenance together

Within the same transaction, reuse the authenticated actor's latest generic
row where applicable or create/update the target using the existing audited
mutation semantics. Insert the submission before returning. Any failure must
roll back the workspace-user mutation; return a typed unavailable/conflict
result for a lost quota race.

### Step 3: Make the route a thin first-class adapter

Remove the generated wrapper, then `git mv` the legacy implementation into the
vacant first-class path. Retain Zod/body sanitization and replace the
multi-write orchestration with the new RPC. Preserve status meanings: missing
404, unavailable 410, auth 401, invalid fields 400, and unexpected failure 500.
Create a first-class-source override entry and regenerate the manifest.

## Test plan

- pgTAP: final slot succeeds once; two concurrent final-slot claims cannot both
  commit; expired/revoked/full links cause no profile mutation; injected
  submission failure rolls back profile changes; authenticated reuse remains
  idempotent by actor.
- Route: status mapping, field sanitation, actor propagation, generic/per-user
  success, and RPC failure without a success envelope.

## Done criteria

- [ ] Link quota/availability is checked under a lock in the write transaction.
- [ ] Profile mutation and submission provenance commit together or not at all.
- [ ] The transaction function is service-role-only and revalidates all identities.
- [ ] Route/migration tracking is first-class and current.
- [ ] DB reset/typegen, tests, route checks, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if G22 ownership remains active, historical counts exceed limits, the
existing audit RPC cannot safely participate in a transaction, or product
owners require anonymous retry idempotency beyond the current contract.

## Maintenance notes

The stats view is presentation data, not a concurrency primitive. Future quota
consumers must reserve/consume capacity inside the mutation transaction.
