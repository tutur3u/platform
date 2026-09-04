# Plan 230: Aggregate AI-Credit Workspace Member Counts Set-Wise

> **Executor instructions:** Replace raw membership materialization in the
> bounded AI-credit balance page with one bounded, trusted grouped-count query
> and fail the admin response closed on enrichment errors.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/infrastructure/src/app/api/v1/admin/ai-credits/balances apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — sequence after/with Plan 146 because both
  modify the exact balance route; database/type ownership must also clear
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / correctness / admin observability
- **Depends on:** Plans 146, 154, and 163
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The route pages at most 100 balance rows but then downloads one
`workspace_members.ws_id` row per member for those workspaces and counts in
JavaScript. Payload and latency therefore scale with total membership, while
PostgREST's row cap can silently undercount large workspaces and still return
HTTP 200 to the admin dashboard.

## Current state and exact contract

- `balances/route.ts` bounds `limit` to 100 and needs one scalar
  `member_count` for each distinct workspace on that page.
- It currently ignores the membership query error; workspace/user enrichment
  errors are also not inspected. Preserve the response envelope and POST
  behavior from Plan 146.
- Add private RPC
  `private.ai_credit_workspace_member_counts(p_ws_ids uuid[]) returns table
  (ws_id uuid, member_count bigint)`. It accepts at most 100 distinct non-null
  ids, groups `workspace_members` once, returns zero by route-side default for
  workspaces with no members, uses a fixed empty search path, and is executable
  only by `service_role`.
- The route must deduplicate `wsIds`, call the RPC once, and return sanitized 500
  for any workspace, user, or count enrichment error rather than plausible
  partial data.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Start from the completed Plan 163 base only after Plan 154
is green and Plan 146's exact route changes are integrated or transferred.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun --cwd apps/infrastructure vitest run src/app/api/v1/admin/ai-credits/balances/route.test.ts` | bounded grouped counts and all enrichment failures pass |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/ai-credit-workspace-member-counts.sql && bun --cwd apps/database sb:validate:isolated` | grouped counts, bounds, ACLs, and full suite pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/ai-credit-workspace-member-counts.sql` | RPC types are current |
| Infrastructure | `bun run --cwd apps/infrastructure type-check && bun run --cwd apps/infrastructure build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** GET enrichment in the Infrastructure balance route; a new
colocated route test; one private grouped-count RPC migration; focused pgTAP;
generated types. **Out of scope:** POST/bonus adjustment semantics, balance
pagination/search, UI shape, member-directory APIs, changing who is counted,
production apply, or other AI-credit routes.

## Steps

1. Add red route tests for exact counts when combined membership exceeds 1,000,
   duplicate workspace ids, empty pages, and independent workspace/user/RPC
   errors. Assert no raw membership select occurs.
2. Add the bounded private grouped-count RPC with signature-specific revoke from
   PUBLIC/anon/authenticated and grant to service_role. Add pgTAP for zero,
   multiple workspaces, >1,000 combined members, duplicate/empty/101-id input,
   and ACL denial.
3. Deduplicate the page's workspace ids, replace the raw select with one RPC,
   inspect every enrichment result, and preserve the public GET envelope.
4. Run isolated DB/typegen, route, Infrastructure, repository, whitespace, and
   exact-scope gates.

## Done criteria

- [ ] GET transfers at most one aggregate row per bounded workspace, never raw
      membership rows.
- [ ] Counts remain exact above the PostgREST row cap and failures are non-2xx.
- [ ] POST and the public GET response shape remain unchanged.
- [ ] RPC ACL/bounds, full DB, typegen, route, build, repository, and whitespace
      gates pass.

## STOP conditions

Stop on Plan 146 route drift without transfer, ambiguity about which membership
rows count, a red Plan 154 baseline, need to change the public response, default
stack mutation, or any mandatory gate failing twice.
