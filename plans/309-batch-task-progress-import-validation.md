# Plan 309: Validate Task Progress Imports Set-Wise

> **Executor instructions:** Replace per-entry validation queries with one
> bounded transactional database contract while preserving the current import
> response and first-invalid-entry behavior.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/import/route.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/import/route.test.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/_schemas.ts' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-progress/_utils.ts' packages/tasks-api/src/progress/client.ts packages/tasks-ui/src/progress/task-progress-page.tsx apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — requires green database baseline and Tasks/database/type transfer
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / correctness
- **Depends on:** Plans 154 and 163; Tasks/database/generated-type coordination
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

A valid 500-entry preview can issue about 4,000 sequential database requests,
and committing the same file repeats validation before the insert. Latency grows
with entries and optional references even though the request is already bounded.

## Current state and exact contract

- `task-progress/import/route.ts:16-46` loops 1..500 entries. Each iteration
  awaits `requireMetricInWorkspace`, then `validateTaskProgressScope`.
- `_utils.ts:191-306` performs one metric query, one board, one project, two
  list, and up to three task/list/board queries per fully populated entry: up to
  eight sequential reads per entry. Preview and commit use the same path.
- Add private `import_task_progress_entries(p_ws_id uuid, p_actor_id uuid,
  p_entries jsonb, p_commit boolean default false) RETURNS jsonb`. SQL must
  reject non-arrays and cardinality outside 1..500, parse with ordinality, and
  reject unknown/invalid row shapes defensively even though Zod remains first.
- Validate distinct metric, board, project, list, and task IDs set-wise. Preserve
  current workspace semantics: metrics must be active in the workspace; boards
  and projects belong directly; lists belong through their board; tasks belong
  through direct board or list->board. Omitted/null optional references are
  accepted; a supplied foreign ID and a supplied nonexistent ID are
  indistinguishable and return the matching 404.
- Preserve deterministic first error by input ordinality and validation priority
  `metric -> board -> project -> list -> task`, mapping exactly to current 404
  messages `Metric not found`, `Board not found`, `Project not found`, `List not
  found`, or `Task not found`. Database/system failures remain sanitized 500.
- Normalize `ws_id`, `created_by`, `source_type='import'`, and default
  `source_id='import:<1-based ordinal>'` in SQL. Preview returns the exact
  normalized entries and summary with zero writes. Commit inserts all rows in
  one transaction and returns the current entry+metric projection; any failure
  rolls back the whole batch.
- The RPC is migration-owner-owned `SECURITY DEFINER`, fixed safe `search_path`,
  fully qualified, revoked from `PUBLIC`/`anon`/`authenticated`, and granted
  only to `service_role`. It tenant-validates `p_actor_id` as the authenticated
  user UUID through `workspace_users.user_id = p_actor_id AND ws_id = p_ws_id`;
  do not compare it to `workspace_users.id`.
- The route authenticates and Zod-validates as today, calls the RPC once, and
  maps typed SQLSTATE/message codes to the frozen response. Client/UI contracts
  remain unchanged.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`; read
`apps/tasks/AGENTS.md`. Obtain database/type and adjacent Tasks review. Do not
edit unrelated task-progress leaderboard work.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-progress/import/route.test.ts'` | one RPC call, mappings, preview, and commit cases pass |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/task-progress-import.test.sql --typegen packages/types/src/supabase.ts` | 500-row, tenant, ACL, ordering, preview, rollback tests pass |
| Typegen determinism | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot"` | second isolated type generation is byte-identical |
| Tasks | `bun run --cwd apps/tasks type-check && bun run --cwd apps/tasks build` | Tasks compiles and builds |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** first-class import route/test; narrow shared schema/utils cleanup;
one private RPC migration/pgTAP; generated types. Client/UI files are
compatibility verification only unless types require a no-behavior-change edit.

**Out of scope:** changing the 500-entry limit or response envelope; CSV parser
UX; leaderboard/achievement paths; production migration application; Rust (no
registered import handler exists at the snapshot).

## Steps

1. Add route and pgTAP failures proving current query fan-out, deterministic
   invalid priority, preview zero writes, and commit rollback.
2. Implement set-wise parsing/validation and transactional insert in the private
   RPC with exact ACL and tenant checks.
3. Replace the loop with one typed RPC call and exact error mapping; keep public
   client/UI behavior unchanged.
4. Run isolated typegen twice, focused tests, Tasks build, and repository gates.

## Done criteria

- [ ] A 500-entry preview or commit performs one route RPC, not per-entry reads.
- [ ] Repeated IDs are validated set-wise and first-invalid responses are stable.
- [ ] Preview writes nothing; commit is all-or-nothing.
- [ ] Existing response/client/UI behavior remains compatible.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on database/type ownership conflict; task/list workspace semantics differing
from the snapshot; an existing supported Rust handler; response-shape drift; a
need to expand the 500-row contract; or a mandatory gate failing twice.

## Maintenance notes

Keep validation priority explicit whenever new optional scope fields are added;
set-wise lookup must not make error selection nondeterministic.
