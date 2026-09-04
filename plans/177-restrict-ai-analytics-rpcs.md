# Plan 177: Restrict AI Execution Analytics to Trusted Server Callers

> **Executor instructions:** Remove direct authenticated execution from every
> current AI execution analytics RPC while preserving the admin-backed root
> analytics page and exact aggregate results.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests 'apps/web/src/app/[locale]/(dashboard)/[wsId]/ai/executions' packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / data disclosure / database
- **Depends on:** Plans 154 and 163 (DONE); external-AI and
  database/generated-type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Six `SECURITY DEFINER` analytics functions accept an arbitrary workspace id and
are executable by authenticated users without an actor check. They expose usage,
token, model, and converted-cost aggregates for another tenant and permit
unbounded date-window work, while the supported UI is a root-admin-only server
surface that already calls them through an admin client.

## Current state

- Four v2 functions—summary, daily stats, model stats, and monthly cost—grant
  EXECUTE to authenticated.
- Later currency work recreates the base summary and monthly-cost overloads and
  grants those to authenticated too.
- The live analytics service calls only the four v2 functions using
  `createAdminClient`; the page separately requires root workspace and
  `manage_workspace_roles`.
- Generated types expose all six signatures, but no supported browser/session
  caller was found.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain external-AI and
database ownership. Catalog actual `pg_proc` overload identities and ACLs on a
fresh disposable stack; do not rely only on historical migration text.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/ai-execution-analytics-access.sql` | ACL and result matrix passes |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/ai-execution-analytics-access.sql` | signatures/results are unchanged or intentional drift is reviewed |
| Web focused | `bun --cwd apps/web vitest run 'src/app/[locale]/(dashboard)/[wsId]/ai/executions/services/analytics-service.test.ts'` | admin-backed analytics contract passes |
| Web types/build | `bun run --cwd apps/web type-check && bun run --cwd apps/web build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** all current overloads of the six named AI execution analytics
functions; ACL/search-path hardening migration; focused pgTAP; admin-service
characterization test only if absent; generated types only for necessary
signature changes.

**Out of scope:** tenant self-service analytics; UI redesign; changing aggregate
math, exchange rates, or date defaults; production apply; other AI RPCs.

## Git workflow

Use `fix/restrict-ai-analytics-rpcs` from the Plan 151/154/163 base and commit
`fix(ai): restrict execution analytics RPCs`. Claim/release the commit window;
do not push.

## Steps

1. Query `pg_proc`/`information_schema.routine_privileges` for every current
   overload of `get_ai_execution_summary`, `get_ai_execution_monthly_cost`, and
   their four v2 counterparts. Confirm no supported session client calls them.
2. Revoke EXECUTE from PUBLIC, anon, and authenticated for every exact current
   signature; grant only service_role. Apply fixed `search_path` hardening to
   every SECURITY DEFINER body without changing its result calculation.
3. Add pgTAP proving authenticated actors cannot execute either their own or a
   foreign workspace call, PUBLIC has no inherited access, service_role gets
   the exact seeded aggregates, and no obsolete exposed overload remains.
4. Characterize the root-admin service against the unchanged v2 response
   mapping. Do not add a browser/session fallback or broaden page permission.
5. Run focused/full disposable DB validation, isolated typegen, Web focused
   test/types/build, repository, and whitespace gates.

## Done criteria

- [ ] No public/anon/authenticated role can execute any current analytics overload.
- [ ] Service-role aggregates and the root-admin page remain unchanged.
- [ ] Every SECURITY DEFINER function has an approved fixed search path.
- [ ] Focused/full DB, typegen, Web, repository, and whitespace gates pass.

## STOP conditions

Stop on a supported direct client, ambiguous overload/body ownership, result
drift, unexpected generated types, red Plan 154 baseline, default-stack
mutation, secret-bearing output, or a mandatory gate failing twice.
