# Plan 218: Update Task Capacity Rules Atomically

> **Executor instructions:** Replace the route's multi-transaction selector
> delete/insert/update sequence with one tenant-bound service-role RPC. A failed
> PATCH must preserve the complete prior rule, including enabled state and all
> selector dimensions.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/capacity-rules' apps/database/supabase/migrations/20260805160000_add_task_capacity_rules.sql apps/database/supabase/tests/task-capacity-rules.sql packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — requires the green Plan 154 database baseline,
  completed Plan 163 typegen base, and Tasks/database ownership transfer
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** correctness / database atomicity
- **Depends on:** Plans 154 and 163
- **Planned at:** commit `52f4aa1b12`, 2026-08-11

## Why this matters

PATCH currently deletes and reinserts each selector dimension through separate
PostgREST transactions, then updates the rule in another transaction. Selector
deletion deliberately disables the rule. Any insertion or final update failure
therefore returns 500 after partially changing selectors and can silently leave
a hard capacity limit disabled. The response must not claim failure while
persisting a weaker policy.

## Current state and exact contract

- `_lib.ts:149-175` implements `replaceSelectors` as sequential delete/insert
  requests for list, label, and project selectors.
- `[ruleId]/route.ts:46-69` calls that helper before the rule update.
- `20260805160000_add_task_capacity_rules.sql:301-316` disables a rule whenever
  a selector row is deleted. Preserve that behavior for genuine external
  selector deletion; only a complete PATCH may restore the caller's final state.
- The current trigger's `label_match_mode = 'all' OR ...` and equivalent project
  expression already allow the final selected relation to cause enforcement.
  Do not alter the capacity-enforcement trigger in this plan.
- Add `public.update_task_capacity_rule_atomic(p_board_id uuid, p_rule_id uuid,
  p_updated_by uuid, p_patch jsonb, p_list_ids uuid[] default null,
  p_label_ids uuid[] default null, p_project_ids uuid[] default null) returns
  uuid`. `NULL` selector arrays mean “dimension absent from PATCH”; an empty
  array means “replace this dimension with none.” Return the rule id on success
  and SQL `NULL` when the `(board_id,id)` rule does not exist.
- The RPC locks the target rule, derives the board workspace, validates lists
  against that board and labels/projects against that workspace, applies only
  non-null dimensions, and updates only these JSON keys: `name`, `enabled`,
  `limit_value`, `metric`, `enforcement`, `counting_mode`, `label_match_mode`,
  and `project_match_mode`. It owns `updated_by`, `updated_at`, and
  `disabled_reason`. Unknown keys raise SQLSTATE `P0001` with
  `TASK_CAPACITY_PATCH_INVALID`; missing, foreign, or duplicate selectors raise
  `P0001` with `TASK_CAPACITY_SELECTOR_INVALID`. Revoke PUBLIC, anon, and
  authenticated execution for the exact signature; grant only service role.
- Snapshot the locked rule's `enabled` and `disabled_reason` before selector
  deletion. If `enabled` is absent, restore both snapshot values after selector
  replacement. If explicitly true, persist `enabled=true` and
  `disabled_reason=null`; if explicitly false, persist `enabled=false` and
  `disabled_reason='manually_disabled'`. Thus the selector-delete trigger still
  protects external deletes but cannot leak an intermediate disabled state from
  a successful atomic PATCH.
- The route builds `p_patch` directly from the eight allowlisted body-derived
  fields; do not call `rulePayload` and do not pass `updated_by`, `updated_at`,
  or `disabled_reason`. Pass a selector array only when that request property
  exists. Map a null result to the existing 404. Map
  `TASK_CAPACITY_PATCH_INVALID` to `{error:'Invalid capacity rule payload'}` and
  `TASK_CAPACITY_SELECTOR_INVALID` to
  `{error:'One or more selectors do not belong to this board workspace'}`, both
  status 400; every other error uses the existing sanitized 500. Then call
  `loadCapacityRules` unchanged.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, `$tuturuuu-commit`, `$supabase`, and
`$supabase-postgres-best-practices`. Start from the combined reviewed Plan 154
and Plan 163 integration base only after Plan 154 is green. Read root and Tasks
AGENTS plus the database skill references. Require Tasks/database/generated-type transfer before an
exact-base isolated worktree and immediate `bun setup`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route tests | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/capacity-rules/[ruleId]/route.test.ts'` | PATCH success/failure/authorization cases pass |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/task-capacity-rules.sql` | fresh migration applies; atomicity matrix passes |
| Full database/typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts` | full pgTAP passes, then typegen exits 0 |
| Tasks | `bun run --cwd apps/tasks type-check && bun run --cwd apps/tasks build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** a new migration created with `bun sb:new`; the existing capacity
pgTAP file; capacity `_lib.ts`, `[ruleId]/route.ts`, and a new colocated route
test; generated Supabase types. **Out of scope:** capacity matching/enforcement
semantics, create/delete endpoints, UI/messages, other Task mutations, or
editing the historical migration.

## Steps

1. Add route characterization plus pgTAP fault probes. Prove a rejected foreign
   selector, duplicate/constraint failure, and forced late rule-update failure
   leave rule fields, enabled/disabled state, and all three selector arrays
   byte-equivalent to the pre-call snapshot. Prove successful partial patches
   replace only supplied dimensions.
2. Create an additive migration with the exact function contract above. Lock
   the rule row, derive board workspace, validate every supplied selector,
   apply replacements and allowlisted patch fields, and return the UUID. Add
   signature-specific revoke/grant and privilege assertions. The late-failure
   pgTAP probe passes `limit_value: 0` after selector arrays so the table check
   fails inside the RPC and proves preceding selector writes roll back; route
   Zod still prevents that invalid production input.
3. Replace `replaceSelectors`, `rulePayload`, and the separate route update with
   one RPC call using the exact field/error mapping above. Delete those helpers
   if no caller remains. Preserve Zod validation, permissions, 404/400/500
   envelopes, app-session support, and the final `loadCapacityRules` response.
4. Run focused and full isolated database gates, typegen, route tests, Tasks
   typecheck/build, repository, whitespace, and scope review.

## Done criteria

- [ ] PATCH success commits the rule and supplied selector dimensions once.
- [ ] Every validation/constraint/late failure leaves the entire prior rule
      unchanged and enabled state cannot be weakened.
- [ ] The RPC is tenant-bound and executable only by service role.
- [ ] Focused/full pgTAP, typegen, route tests, Tasks gates, `bun check`, and
      whitespace pass.

## STOP conditions

Stop if Plan 154 is not green, Plan 163 is unavailable, existing mismatches
appear, ownership is unresolved, the route response must change, generated
types drift beyond this RPC, or any mandatory gate fails twice.
