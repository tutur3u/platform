# Plan 256: Replace Auth-Recovery Overrides Atomically

> **Executor instructions:** Make one normalized-email override replacement a
> single locked database transaction. A rejected replacement must leave the
> currently valid emergency exception unchanged, and concurrent replacements
> must serialize deterministically.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/infrastructure/src/lib/auth/recovery-overrides.ts apps/infrastructure/src/lib/auth/recovery-overrides.test.ts apps/web/src/lib/auth/recovery-overrides.ts apps/web/src/lib/auth/recovery-overrides.test.ts 'apps/infrastructure/src/app/api/v1/infrastructure/auth-recovery/route.ts' apps/infrastructure/src/app/api/v1/infrastructure/auth-recovery/route.test.ts apps/database/supabase/migrations apps/database/supabase/tests/private-schema-auth-recovery.sql packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — execute only after Plan 154 is green and the
  database/generated-type lane transfers; no active exact runtime-path owner
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / authentication recovery / transactional safety
- **Depends on:** Plans 154 and 163; database/generated-type ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Both TypeScript copies revoke every active override for an email, ignore the
update result, and only then attempt the replacement insert. Invalid expiry or
a transient insert failure therefore removes the only working emergency login
exception while returning an error. During an incident, an administrator's
attempt to renew access can prolong the lockout it was meant to resolve.

## Current state and exact contract

- Byte-identical `apps/infrastructure/src/lib/auth/recovery-overrides.ts:55-78`
  and `apps/web/src/lib/auth/recovery-overrides.ts:55-78` perform two independent
  writes; the first result is not inspected.
- `20260628083745_auth_recovery_email.sql:22-23` rejects
  `expires_at <= created_at`; lines 30-32 provide uniqueness but no atomic
  replacement.
- The Infrastructure POST schema validates only datetime syntax. Require
  `expiresAt` strictly later than request time and keep the existing default of
  seven days. Route validation failure remains the existing 400 envelope.
- Add exact RPC
  `private.replace_auth_recovery_override(p_email text, p_reason text,
  p_allow_normal_login boolean, p_allow_recovery_email boolean,
  p_expires_at timestamptz, p_actor_user_id uuid)
  returns setof private.auth_recovery_overrides`.
- The SECURITY DEFINER function uses `set search_path = ''`, normalizes and
  validates the email, trims/validates reason, requires at least one mode, and
  takes a transaction-scoped advisory lock derived from the normalized email
  (so the zero-existing-row case also serializes). Only after acquiring that
  lock, capture `clock_timestamp()` and require `p_expires_at` to be later than
  that instant. Lock any unrevoked row, revoke it with the existing superseded
  metadata, insert the replacement with the same instant as explicit
  `created_at`/`updated_at`, and return exactly that row. Any error rolls back
  both writes.
- Raise closed SQLSTATE `P0001` message `AUTH_RECOVERY_OVERRIDE_INVALID` for
  function-level validation. Map it to the existing
  `400 {message:'Invalid request data'}` shape; every unclassified database
  error is a sanitized 500. Do not return raw database text. Concurrent valid
  calls serialize and may both succeed in lock order; the later committed call
  becomes the sole active override.
- Revoke the exact function signature from PUBLIC, `anon`, and
  `authenticated`; grant only `service_role`. Both app-local helper copies use
  the same typed RPC and retain the current summary return type.
- OTP-limit reset and recovery-event logging occur only after the committed
  replacement, in their current order. Their failure must never cause fallback
  direct writes or claim that the database transaction rolled back; changing
  their response/retry policy is outside this plan.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from the completed Plan 163 validator base only
after Plan 154 is green. Inspect active database/type ownership. The blocked
Plan 017 note owns only the blocked-IP route/test and is adjacent, not an
exact-path lock.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route/helper | `bun --cwd apps/infrastructure vitest run src/lib/auth/recovery-overrides.test.ts src/app/api/v1/infrastructure/auth-recovery/route.test.ts` | valid/default/invalid, sanitized RPC failure, and side-effect ordering pass |
| Web parity | `bun --cwd apps/web vitest run src/lib/auth/recovery-overrides.test.ts` | the compatibility helper uses the same RPC/result contract |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/private-schema-auth-recovery.sql && bun --cwd apps/database sb:validate:isolated` | rollback, serialization, validation, uniqueness, and ACL assertions pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/private-schema-auth-recovery.sql` | generated RPC types are current with no unrelated drift |
| Apps | `bun run --cwd apps/infrastructure type-check && bun run --cwd apps/web type-check && bun run --cwd apps/infrastructure build && bun run --cwd apps/web build` | typechecks/builds exit 0 serially |
| Repository | `bun check && git diff --check` | all canonical gates pass; whitespace output is empty |

## Scope

**In scope:** both identical recovery-override helpers and focused tests; the
Infrastructure collection route/test; one additive migration; the existing
private auth-recovery pgTAP suite; generated database types.

**Out of scope:** credential consumption, recovery-email delivery, session
issuance, password/login semantics, UI/messages, changing default duration or
permission, post-commit side-effect retry/response redesign, removing the Web
compatibility copy, production migration apply, or unrelated
abuse-intelligence routes.

## Steps

1. Add red route/helper tests for expired/future inputs, RPC success, named
   invalid results, unclassified failure sanitization, and
   post-commit reset/log ordering. Prove no direct table revoke/insert remains.
2. Extend the existing pgTAP fixture with a valid active override, then prove
   every invalid replacement leaves it byte-for-byte active and no replacement
   row exists. Add empty-row and existing-row success cases.
3. Add the exact function and signature-specific ACLs. Use an email-derived
   advisory transaction lock before reading, then row locks where present.
   Preserve the existing superseded revoke fields and table constraints.
4. Add a deterministic two-connection pgTAP barrier: hold the email advisory
   lock in a setup transaction, dispatch two different valid replacements,
   assert both workers are waiting, release setup, then prove both complete in
   serialized order, exactly one of the two replacements remains unrevoked,
   the other is superseded by the winner, and no partial state exists. Release
   every connection/transaction on exceptions.
5. Replace direct writes in both helpers with the typed RPC. Validate expiry at
   the route edge, translate only named results, and keep reset/event work
   strictly after commit without fallback database writes.
6. Run focused tests, full isolated DB, typegen, both typechecks/builds,
   repository, whitespace, and exact-scope gates.

## Done criteria

- [ ] Any rejected replacement preserves the prior active override and its
      revoke fields unchanged.
- [ ] Valid and concurrent replacements serialize to exactly one active row,
      with revocation plus insertion committed atomically.
- [ ] Only service role can execute the fixed-search-path RPC; app callers use
      generated types and expose no raw database errors.
- [ ] OTP reset/event work starts only after commit and cannot trigger fallback
      direct writes.
- [ ] Focused/full DB, typegen, app typecheck/build, repository, whitespace,
      and scope gates pass.

## STOP conditions

Stop on red Plan 154 baseline, database/type ownership conflict, historical
rows violating the current uniqueness/normalization constraints, another
writer that cannot adopt the RPC, inability to create a deterministic
credential-free concurrency barrier, need to change login/session semantics,
production apply, or any mandatory gate failing twice.

## Maintenance notes

Emergency access replacement is one state transition. Never revoke the known-
good override until every field of its successor has been validated and the
replacement can commit in the same transaction.
