# Plan 192: Bind Transaction Statistics to the Authenticated Actor

> **Executor instructions:** Prevent caller-selected Finance permission
> impersonation while preserving the separate trusted server path used by Rust.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts 'apps/finance/src/app/api/workspaces/[wsId]/transactions/stats' apps/backend/src/workspaces_transactions_stats.rs apps/backend/api/openapi.yaml tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / database authorization
- **Depends on:** Plan 154 (BLOCKED); Finance/Inventory and G20 wallets/transactions backend ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

`get_transaction_stats` evaluates every permission and wallet allowlist against
caller-controlled `p_user_id`, not the authenticated actor. Any authenticated
client can therefore impersonate a more privileged user and retrieve monetary
totals, including confidential amounts, from a selected workspace. The live
Finance route is safe only because it happens to pass its resolved actor.

## Current state

- `20260503100000_add_transaction_type_filter_to_transaction_rpcs.sql:15-126`
  defines the definer RPC and explicitly grants it to `authenticated`.
- Lines 51-67 call `has_workspace_permission(p_ws_id, p_user_id, ...)` and
  derive the wallet whitelist from `p_user_id`; there is no equality check with
  `auth.uid()`.
- `apps/finance/.../transactions/stats/route.ts:55-107` requires
  `view_transactions` and supplies `user.id`.
- `apps/backend/src/workspaces_transactions_stats.rs:116-160` authorizes first,
  sends the browser access token when available, and falls back to a service
  bearer only when no caller token exists; its `apikey` header alone does not
  change the caller-token role.
- `packages/finance-core/src/route-auth.ts:21-32` builds app/CLI session contexts
  on an admin client, while `attachSupabaseAuthUser` changes only local auth
  methods. Those maintained calls reach PostgreSQL as service role with an
  explicit resolved actor.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database,
Finance, and backend instructions. Execute from Plan 151 after Plan 154 is green
and obtain Finance plus the G20 wallets/transactions transfer.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n "get_transaction_stats" apps packages --glob '!packages/types/src/supabase.ts'` | Finance and prepared Rust callers are fully classified |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/transaction-stats-actor-binding.sql` | self/trusted/impersonation/tenant matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Finance focused | `bun --cwd apps/finance vitest run 'src/app/api/workspaces/[wsId]/transactions/stats/route.test.ts'` | cookie and admin-backed app-session credential contracts pass |
| Backend focused | `cargo test --manifest-path apps/backend/Cargo.toml workspaces_transactions_stats` | trusted Rust path remains authorized and response-compatible |
| Backend full | `bun check:backend` | exit 0 |
| Finance typecheck | `bun run --cwd apps/finance type-check` | exit 0 |
| Type drift | `git diff --exit-code -- packages/types/src/supabase.ts` | no signature/type drift |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** additive replacement/ACL migration for the existing signature;
pgTAP credential/actor matrix; Finance/Rust characterization tests proving both
caller-token and service-role modes; create the focused Finance route test. No
production caller change is expected.

**Out of scope:** transaction-list pagination/enrichment; changing Finance
permissions or confidential-amount semantics; route response changes; Rust
cutover; production apply.

## Git workflow

After transfers, use `fix/bind-transaction-stats-actor` and commit
`fix(finance): bind transaction stats to actor`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Freeze the signature, Finance response, and both Rust authorization-header
   branches. Add red pgTAP showing an authenticated low-privilege caller can
   pass a privileged user's id today. **Verify:** it fails only on impersonation
   cases before implementation.
2. In the existing function, compute the effective database role first. For
   `authenticated`, require non-null `auth.uid()` and exact equality with
   `p_user_id` before permission lookup. For `service_role`, permit the explicit
   server-resolved actor. Deny `anon`, null/unknown roles, and mismatches; set a
   fixed search path and revoke `PUBLIC`/`anon`. Preserve the exact signature so
   types do not drift. **Verify:** caller-token self calls work, caller-token
   impersonation fails, and service-role explicit-actor fixtures work.
3. Characterize Finance cookie auth, Finance app/CLI sessions, Rust with a
   caller access token, and Rust's service fallback. Each must continue to pass
   the already-authorized actor id and preserve response mapping; do not force
   caller-token Rust traffic onto service role. **Verify:** focused Finance/Rust
   fixtures assert the outgoing authorization mode and no raw error drift.
4. Run the no-type-drift check, full database/backend/Finance/repository gates.

## Done criteria

- [ ] Authenticated callers cannot choose whose Finance permissions apply.
- [ ] Cross-workspace and privileged-user impersonation return no totals.
- [ ] Rust caller-token traffic remains authenticated self-service; only its
      explicit no-token fallback and Finance app/CLI paths use service role.
- [ ] Confidential-amount and wallet-whitelist semantics are unchanged for the
      legitimate actor.
- [ ] Focused/full database, backend, Finance, and repository gates pass with no
      signature/type drift.

## STOP conditions

Stop on red Plan 154, Finance/G20 ownership, an unclassified direct client,
inability to distinguish caller-token and service-role execution, ambiguous app-session
credential behavior, unexpected response/type drift, or any gate failing twice.
