# Plan 270: Authorize Global Email-Blacklist Mutations

> **Executor instructions:** Preserve the existing root-workspace read contract,
> but require root `manage_workspace_roles` for POST, PUT, and DELETE in the
> live Infrastructure route, prepared Rust handler, and direct authenticated
> database access. Keep validation and response envelopes aligned.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/infrastructure/src/app/api/v1/infrastructure/email-blacklist' apps/infrastructure/src/lib/infrastructure-admin-access.ts apps/backend/src/email_blacklist.rs apps/backend/src/email_blacklist_write.rs apps/backend/src/infrastructure_root_auth.rs apps/backend/src/tests apps/backend/api/openapi.yaml apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — obtain backend/G22, database-migration, and
  generated-type ownership transfer
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / authorization / database parity
- **Depends on:** Plans 154 and 163; coordinate with Plan 017's reviewed
  Infrastructure authorization pattern
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The email/domain blacklist is a platform-wide abuse control. Today any ordinary
member of the root workspace can create, alter, or delete entries through the
live TypeScript route, the prepared Rust implementation, or the authenticated
Data API. Membership alone must not grant a global destructive capability.

## Current state and exact contract

- The collection POST and item PUT/DELETE under
  `apps/infrastructure/src/app/api/v1/infrastructure/email-blacklist/**` prove
  only root-workspace membership before mutating `email_blacklist`.
- `apps/backend/src/email_blacklist.rs` and `email_blacklist_write.rs` reuse
  root read authorization for the same mutations.
- Migration `20251102072057_email_blacklist.sql` defines one permissive `FOR
  ALL` policy for every authenticated root member.
- Keep GET collection/item behavior unchanged. Require the root workspace's
  existing `manage_workspace_roles` permission for every mutation, matching
  the global-holiday mutation contract in Plan 164. A valid actor without the
  permission receives 403; missing/invalid auth receives 401. Preserve the
  shared authorizer's fail-closed behavior: an unavailable/null permission
  result is indistinguishable from denial and returns the same sanitized 403.
- TypeScript must use the registered Infrastructure app-session actor via
  `authorizeInfrastructureAdminRequest('manage_workspace_roles')`, then use
  the returned admin client and actor ID. Do not retain cookie-only membership
  as a mutation fallback.
- Rust must resolve the caller token and call `has_workspace_permission` for
  root `00000000-0000-0000-0000-000000000000` plus
  `manage_workspace_roles`. Map missing/invalid auth to 401 and both denied or
  unavailable permission evidence to the same sanitized 403 as TypeScript.
  Preserve current success/validation/not-found bodies and the still-separate
  GET authorization behavior.
- Replace the membership-only database write policy with INSERT, UPDATE, and
  DELETE policies using the same permission predicate. Preserve the current
  authenticated read policy. Service role remains permitted.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root, database, Infrastructure, and backend AGENTS.
Execute from the completed Plan 163 integration base only after Plan 154 is
green and all named owners transfer. Do not apply production migrations.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Infrastructure routes | `bun --cwd apps/infrastructure vitest run 'src/app/api/v1/infrastructure/email-blacklist/route.test.ts' 'src/app/api/v1/infrastructure/email-blacklist/[entryId]/route.test.ts'` | GET compatibility and every mutation permission/status case pass |
| Rust | `cd apps/backend && cargo test --lib email_blacklist` | focused read/write authorization and response parity pass |
| Backend contract | `bun check:backend` | formatting, clippy, tests, Worker, and OpenAPI checks pass |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/email-blacklist-permissions.sql` | read and direct-write matrix passes |
| Full/typegen database | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts` | full pgTAP passes and generated types are refreshed atomically |
| App | `bun run --cwd apps/infrastructure type-check && bun run --cwd apps/infrastructure build` | both exit 0 |
| Repository | `bun check && git diff --check` | canonical gates pass; whitespace output is empty |

## Scope

**In scope:** the two Infrastructure email-blacklist route handlers and new
focused tests; explicit shared authorizer use; Rust read/write authorization,
focused tests, and OpenAPI descriptions; one additive policy migration and one
pgTAP file; generated types only if typegen changes them.

**Out of scope:** changing blacklist matching/normalization, read visibility,
adding a permission enum, IP denylist behavior, other Infrastructure routes,
production cutover, or production migration application.

## Steps

1. Add route tests for GET compatibility and POST/PUT/DELETE with missing app
   session, ordinary root membership, view-only access, explicit role-manager
   access, null/unavailable permission result, validation, duplicates, missing
   items, and
   database errors. Assert denial precedes body parsing and admin writes.
2. Replace mutation-local membership checks with the explicit app-session-safe
   `manage_workspace_roles` authorization. Preserve GET unchanged.
3. Add a migration that drops the exact legacy `FOR ALL` policy and creates a
   read policy plus signature-equivalent write policies backed by
   `has_workspace_permission`. Add pgTAP for anon, ordinary root member,
   view-only member, role manager, non-root role manager, and service role
   across SELECT/INSERT/UPDATE/DELETE.
4. Split Rust read from mutation authorization. Reuse the root permission RPC
   and classify 401/403 exactly as above; extend focused tests for all methods and
   update OpenAPI authorization descriptions without marking Rust deployed.
5. Run focused/full database validation and typegen, focused/full backend
   checks, Infrastructure typecheck/build, repository, whitespace, and scope
   gates.

## Done criteria

- [ ] Root membership or read permission alone cannot mutate the global email
      blacklist through TypeScript, Rust, or the Data API.
- [ ] Root `manage_workspace_roles` authorizes every mutation and GET retains
      its existing contract.
- [ ] TypeScript/Rust statuses and mutation response bodies remain aligned.
- [ ] Focused/full database, backend, app, build, repository, typegen, and
      whitespace gates pass with no out-of-scope changes.

## STOP conditions

Stop on missing ownership transfer, Plan 154 not green, an active exact-path
owner, evidence that operators require a different existing permission, a need
for a new permission enum, changed read visibility, unexpected TypeScript/Rust
mutation drift, or any mandatory gate failing twice.

## Maintenance notes

Global read access and global mutation authority are separate contracts. New
Infrastructure global-control routes should reuse the explicit app-session
permission boundary rather than root membership or email-domain shortcuts.
