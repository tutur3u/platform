# Plan 202: Restrict Workspace-Overview RPCs to Trusted Callers

> **Executor instructions:** Remove public Data API execution from the two
> platform-wide workspace overview functions without changing their result
> shapes or the root-gated Infrastructure page.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/workspaces' tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** security / database function ACL
- **Depends on:** Plans 154 and 163; database/Infrastructure ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from the eventual
  green Plan 154 result incorporating reviewed Plan 163 commit `3f61e928ea`

## Why this matters

Two `SECURITY DEFINER` functions expose tenant identities, creator emails,
organization sizes, secret counts, subscription tiers/statuses, and billing
error aggregates. The maintained Infrastructure page treats this as root-only,
but the functions inherited public-schema execution grants.

## Current state and exact contract

- `20260211010000_fix_highest_tier_active_only.sql:7-158` defines
  `get_workspace_overview(text,text,text,text,text,text,text,int,int)` without a
  caller check and returns platform-wide creator and subscription metadata.
- `20260210170000_add_errored_workspaces_to_overview.sql:8-91` defines the
  no-argument summary with platform-wide counts.
- The only in-repo runtime caller is the root-gated admin-client loader in
  `apps/infrastructure/.../workspaces/data-fetching.ts`.
- Add an ACL-only migration that revokes both exact signatures from `PUBLIC`,
  `anon`, and `authenticated`, then grants only `service_role`. Do not rewrite
  either function or change its projection, ordering, filters, defaults, or
  page response.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`, `$supabase-postgres-best-practices`,
`$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and `$tuturuuu-commit`.
Read root, database, and Infrastructure instructions. Obtain the exact database
claim and confirm repository callers still use an admin/service-role client.
Stop if any supported direct caller requires `anon` or `authenticated` execute.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/workspace-overview-rpc-privileges.sql` | privilege denials and service-role parity pass |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP suite passes |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/workspace-overview-rpc-privileges.sql` | focused test passes |
| No type drift | `git diff --exit-code -- packages/types/src/supabase.ts` | no output; ACL-only migration changes no generated type |
| Infrastructure | `bun --cwd apps/infrastructure vitest run 'src/app/[locale]/(dashboard)/[wsId]/workspaces/data-fetching.test.ts'` | new caller test proves both RPCs use the injected admin client and preserve success/error mapping |
| Typecheck | `bun run --cwd apps/infrastructure type-check` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive ACL migration; one focused pgTAP file; new
`apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/workspaces/data-fetching.test.ts`;
the smallest injectable admin-client seam in `data-fetching.ts` if required.

**Read-only evidence:** current overview function bodies, generated types, and
the root-gated Infrastructure page/loader.

**Out of scope:** projection/query changes, page UI, subscriptions, billing
logic, route migration, generated-type edits, or production apply.

## Steps

1. Inventory every SQL/TypeScript/Rust caller and prove each supported runtime
   call uses `service_role`. Add the named Infrastructure test with an injected
   admin client: assert exact RPC names/arguments, unchanged successful mapping,
   and sanitized propagation of each RPC error. Freeze both current result
   shapes with service-role pgTAP fixtures.
2. Create an additive migration with signature-specific `REVOKE EXECUTE` from
   `PUBLIC`, `anon`, and `authenticated`, plus `GRANT EXECUTE TO service_role`
   for both functions.
3. Add pgTAP assertions using `has_function_privilege` and actual role-switched
   calls: untrusted roles cannot execute; service role returns the same columns
   and bounded fixture rows/summary.
4. Run focused/full isolated database validation, isolated typegen plus the
   mandatory no-diff assertion, Infrastructure characterization/typecheck,
   `bun check`, and whitespace verification.

## Done criteria

- [ ] Anonymous and authenticated Data API roles cannot execute either overview RPC.
- [ ] Service-role callers retain byte-compatible result columns and semantics.
- [ ] The root-gated Infrastructure caller remains green.
- [ ] Full database, no-type-drift, repository, and whitespace gates pass.

## STOP conditions

Stop if Plan 154 is not green, ownership is unavailable, an undocumented
supported untrusted caller exists, the function signature differs, generated
types drift, the default Supabase stack is mutated, or a mandatory gate fails
twice.
