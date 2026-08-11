# Plan 181: Fail Closed on Public Session-Management RPCs

> **Executor instructions:** Remove anonymous execution and make every session
> RPC explicitly reject a missing or mismatched authenticated actor without
> changing supported Web/Rust responses.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/web/src/legacy-api-routes/v1/users/sessions apps/web/src/app/api/v1/users/sessions apps/backend/src/users_sessions.rs apps/backend/api/openapi.yaml tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** HIGH
- **Category:** security / authentication / database
- **Depends on:** Plan 154 (BLOCKED), Plan 163 (DONE); database/generated-type and backend/G22 ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Four `SECURITY DEFINER` functions use `auth.uid() != target_user_id`. In SQL,
that condition is null rather than true for an unauthenticated caller, so it
does not raise. Default public function privileges can then expose session/IP
metadata or delete another user's sessions through the Data API.

## Current state

- `20250611073234_add_session_management.sql:5-144` defines
  `get_user_sessions`, `get_user_session_stats`, `revoke_user_session`, and
  `revoke_all_other_sessions` with the null-unsafe comparison.
- The Web routes resolve the current user and pass that id. Rust GET forwards
  the caller's Supabase bearer token specifically because the functions rely
  on `auth.uid()` and `auth.jwt()`.
- GET result fields and DELETE response envelopes must remain unchanged.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database and
backend AGENTS. Inventory live ACLs and direct/external consumers before deciding
whether service-role execution is supported.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/session-management-rpc-auth.sql` | all four actor/ACL matrices pass |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/session-management-rpc-auth.sql` | no signature drift |
| Backend focused | `cargo test --manifest-path apps/backend/Cargo.toml users_sessions` | focused Rust tests pass |
| Backend full | `bun check:backend` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive migration replacing/locking down the four functions;
`session-management-rpc-auth.sql`; generated types only if unavoidable;
TypeScript/Rust session handlers as read-only parity evidence.

**Out of scope:** session UI/response changes; auth schema redesign; app-session
support; route migration/cutover; production apply.

## Git workflow

Use `fix/fail-closed-session-rpcs` and commit
`fix(auth): fail closed on session RPCs`. Claim/release the commit window; do
not push or apply production migrations.

## Steps

1. Catalog current definitions, overloads, grants, and all callers. Confirm the
   Web and Rust routes invoke with a user JWT and exact self id.
2. Replace all four functions with fixed `search_path` and explicit
   `auth.uid() IS NULL OR auth.uid() <> target` rejection before reading or
   mutating `auth.sessions`. Preserve signatures, result rows, and successful
   self behavior.
3. Revoke execute from `PUBLIC` and `anon`; explicitly grant authenticated.
   Grant service role only if Step 1 proves a supported administrative caller,
   and then use a separately explicit trusted branch rather than null-auth
   fallthrough.
4. Test anonymous, mismatched actor, self read/stats, specific self revoke,
   foreign-session revoke, all-other preservation of the current session, and
   any approved service-role behavior. Assert denied destructive calls leave
   every session intact.
5. Run focused/full disposable DB, typegen, backend focused/full, repository,
   and whitespace gates. Prove no TypeScript/Rust response artifact changed.

## Done criteria

- [ ] Missing auth can neither inspect nor revoke sessions.
- [ ] A user can act only on their own sessions.
- [ ] ACLs exclude `PUBLIC` and `anon`.
- [ ] Supported Web/Rust shapes and successful self flows are unchanged.
- [ ] Focused/full DB, typegen, backend, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, unknown external caller semantics, inability to test
auth-session deletion safely in the disposable stack, signature/response drift,
unexpected typegen drift, a red Plan 154 baseline, or a gate failing twice.
