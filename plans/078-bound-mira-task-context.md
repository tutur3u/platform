# Plan 078: Bound Mira Task Context Retrieval

> **Executor instructions:** Replace the all-task fetch on every Mira turn with
> one bounded, deterministic database projection that also returns total count.
> Do not execute while generated database artifacts are owned elsewhere.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/ai/src/chat/google/route.ts packages/ai/src/tools/context-builder.ts packages/ai/src/tools/context-builder.test.ts apps/database/supabase/migrations/20260212163901_update_rpc_overrides.sql apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on Mira context, access, schema, or generated-type drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Performance / database query shape
- **Depends on:** generated database type and migration ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Every Mira turn fetches every active task the user can access, materializes the
full records in the server, and then keeps at most 25 summaries. Cost and
latency grow with a user's complete cross-workspace task history even though
the prompt has a fixed useful capacity.

## Current state

- `packages/ai/src/chat/google/route.ts:478` prepares Mira context for every
  Mira-mode provider request.
- `packages/ai/src/tools/context-builder.ts:94-115,224-249` calls
  `get_user_accessible_tasks` without bounds, filters the complete result, and
  retains 10 overdue, 10 today, and 5 upcoming items.
- `apps/database/supabase/migrations/20260212163901_update_rpc_overrides.sql:16-155`
  returns full task records with no `ORDER BY` or `LIMIT`; personal context can
  include assignments across all memberships.
- The replacement must preserve the total active count displayed to the model,
  so simply adding one global limit is not equivalent.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. Wait until every active owner of generated
database types and overlapping AI Studio migrations releases or transfers its
paths. Run `git status --short` and create the migration with `bun sb:new`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Create migration | `bun sb:new bound_mira_task_context` | one timestamped additive migration |
| Apply locally | `bun sb:up` | migration applies without destructive changes |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | new pgTAP assertions pass |
| Generate types | `bun sb:typegen` | only expected generated RPC/type changes |
| AI tests | `bun run --cwd packages/ai test -- src/tools/context-builder.test.ts` | bounded/context parity cases pass |
| AI types | `bun run --cwd packages/ai type-check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | shared Google route compiles in production app |
| Repository gate | `bun check` | exit 0, or only a documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- one additive `apps/database/supabase/migrations/*_bound_mira_task_context.sql`
- one focused `apps/database/supabase/tests/mira-task-context.sql`
- `packages/ai/src/tools/context-builder.ts`
- `packages/ai/src/tools/context-builder.test.ts` (create if absent)
- generated `packages/types/src/supabase.ts`
- `plans/README.md` only for status

Do not alter generic task-list APIs, task authorization, prompt limits, provider
selection, credit settlement, or unrelated AI Studio functions.

## Git workflow

Use branch `perf/bound-mira-task-context` in an isolated worktree and run
`bun setup`. Commit `perf(ai): bound mira task context retrieval`. Claim the
commit window before staging; do not push unless instructed.

## Steps

### Step 1: Freeze access and ordering semantics

Add pgTAP fixtures for a shared workspace, personal alias behavior, assignments
across memberships, revoked/nonmember access, completed tasks, null dates,
overrides, and ties. Define deterministic ordering as due date ascending then
task ID ascending within each bucket. Preserve the existing overdue/today/
upcoming day-boundary semantics in the user's established timezone; stop if no
authoritative timezone is available at this layer.

### Step 2: Add one actor-bound bounded RPC

Create one authenticated `SECURITY DEFINER` function with exactly these public
inputs: route workspace UUID and IANA timezone string. Derive the actor only
from `auth.uid()`; expose no caller-selected user ID, reject a null actor, and
verify the route workspace/personal-workspace relationship before any task
query. Validate the timezone against `pg_timezone_names`, derive today/week
boundaries server-side, set an explicit safe `search_path`, revoke default
execution, and grant only `authenticated`.

Return one JSON object with this exact generated/runtime contract:
`{ total_active_count: number, overdue: TaskSummary[], today: TaskSummary[], upcoming: TaskSummary[] }`,
where `TaskSummary` is exactly `{ task_id, task_name, task_priority,
task_end_date }`. Validate the JSON response with a colocated Zod schema before
prompt mapping. The arrays must contain:

- `total_active_count` for all accessible active tasks;
- at most 10 overdue summaries;
- at most 10 due-today summaries;
- at most 5 upcoming summaries.

Apply limits inside each
ordered database branch, not after one unbounded union. Preserve workspace and
personal-assignment visibility exactly; set search path/privileges explicitly
and add anonymous, cross-user (proving no user parameter exists), invalid
timezone, and cross-workspace pgTAP coverage.

### Step 3: Switch the context builder atomically

Call the new typed RPC once, map its bounded projections into the existing
prompt shape, and use its aggregate total. Remove the all-row materialization
only from Mira context; do not change generic task consumers.

### Step 4: Prove bounded cardinality

Use a fixture with hundreds of eligible tasks and assert the RPC still returns
at most 25 rows plus one total. Run database, AI, typegen, typecheck, real Web
build, and repository gates.

## Test plan

- Shared and personal access match the existing authorization rules.
- Hundreds of tasks produce exact total and no more than 10/10/5 summaries.
- Bucket boundaries, null dates, ties, overrides, and completed tasks behave
  deterministically.
- Anonymous, revoked/nonmember, invalid-timezone, and cross-workspace callers
  cannot receive task data; the function exposes no actor override.
- Context-builder output remains compatible and makes one bounded RPC call.

## Done criteria

- [ ] Mira never downloads all accessible tasks to build one prompt.
- [ ] Result row cardinality is constant while total count remains exact.
- [ ] Permission and personal-workspace parity are proven in pgTAP.
- [ ] Migration apply, typegen, focused tests, types, Web build, `bun check`,
  and whitespace pass.
- [ ] Production duplicate/signature preflight is documented before rollout.

## STOP conditions

Stop if generated-type/migration ownership remains active, personal-workspace
semantics cannot be reproduced, the authoritative timezone is unavailable,
production function signatures conflict, or a required gate fails twice.

## Maintenance notes

Prompt-size limits are not query limits. Keep retrieval cardinality bounded at
the database boundary and preserve an explicit aggregate when product copy
needs the full count.
