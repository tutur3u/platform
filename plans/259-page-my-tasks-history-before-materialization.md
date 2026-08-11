# Plan 259: Page My Tasks History Before Relation Materialization

> **Executor instructions:** Stop loading and relation-hydrating the complete
> completed-task history for every My Tasks request. Add one stable cursor page
> contract while preserving active buckets, personal override semantics, and
> the visible load-more experience.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/tasks/src/app/api/v1/users/me/tasks/route.ts' 'apps/tasks/src/app/api/v1/users/me/tasks/route.test.ts' packages/tasks-ui/src/tu-do/my-tasks/use-my-tasks-query.ts packages/tasks-ui/src/tu-do/my-tasks/__tests__/use-my-tasks-query.test.ts packages/tasks-ui/src/tu-do/my-tasks/use-my-tasks-state.ts packages/tasks-ui/src/tu-do/my-tasks/__tests__/use-my-tasks-state.test.ts packages/tasks-ui/src/tu-do/my-tasks/task-list.tsx packages/internal-api/src/index.ts packages/internal-api/src/my-tasks.ts packages/internal-api/src/my-tasks.test.ts apps/mobile/lib/data/repositories/task_repository.dart apps/mobile/lib/data/models/user_tasks_page.dart apps/mobile/lib/features/tasks/cubit/task_list_cubit.dart apps/mobile/lib/features/tasks/cubit/task_list_state.dart apps/mobile/test/data/repositories/task_repository_test.dart apps/mobile/test/features/tasks/cubit/task_list_cubit_test.dart apps/backend/src/users_me_tasks.rs apps/backend/src/users_me_tasks apps/backend/api/openapi.yaml apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — execute only after Plan 154 restores the full
  isolated pgTAP baseline, from completed Plan 163's isolated-typegen base, and
  after Tasks/database/generated-type, Mobile, and backend/G22 owners approve
  this shared My Tasks RPC and cross-runtime response boundary
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** performance / correctness / API contract / tests
- **Depends on:** Plans 154 and 163 plus Tasks/database/type, Mobile, and
  backend/G22 coordination; sequence with Plan 079 because both change the My
  Tasks query layer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The UI presents completed tasks as 20-row pages, but the route first loads every
active, review, done, personally completed, and personally hidden task with full
description and relation aggregates. The infinite query repeats that complete
work for every apparent page, then slices in memory. Large histories therefore
grow database, JSON, network, and application work with lifetime activity and
can silently report incomplete totals after the PostgREST row ceiling.

## Current state and exact contract

- `apps/tasks/src/app/api/v1/users/me/tasks/route.ts:75-97` invokes
  `get_user_tasks_with_relations` for `not_started`, `active`, `review`, and
  `done` without limit/cursor and loads every board/list override. Lines
  `107-283` materialize, classify, and sort the full response; only lines
  `285-300` apply `completedPage`/`completedLimit` with `Array.slice`.
- `packages/tasks-ui/.../use-my-tasks-query.ts:92-147` implements an infinite
  query over numeric pages, so page two repeats the same unbounded RPC and asks
  the server for a different slice.
- Mobile is a supported combined-envelope consumer:
  `apps/mobile/lib/data/repositories/task_repository.dart:96-112` always sends
  numeric `completedPage`/`completedLimit`, while
  `user_tasks_page.dart:4-45` decodes active and completed buckets together.
  `task_list_cubit.dart:249-271` increments numeric pages for load more.
- `apps/backend/src/users_me_tasks.rs:1-14,50-140,262-274` is a prepared Rust
  implementation of this exact GET and current envelope. It is dispatched but
  absent from OpenAPI at the planned snapshot. Web remains live authority, but
  Rust parity must change in the same plan and be documented without claiming
  production traffic.
- The current SQL definition in
  `20260506215000_add_personal_task_board_placements.sql:111-364` has no page
  inputs or order/limit and builds list, assignee, label, and project JSON with
  correlated subqueries for every matching task.
- Plan 079 removes client catalog fan-out and explicitly forbids a new endpoint
  or migration. It does not bound this server-side history RPC.
- Replace numeric paging with `view=combined|active|completed`, defaulting to
  `combined` for Mobile compatibility. Return one closed envelope in every
  mode: `{ overdue, today, upcoming, completed, totalActiveTasks,
  totalCompletedTasks, nextCompletedCursor }`. `combined` runs the bounded
  active and first completed-page branches; `active` returns empty `completed`,
  `totalCompletedTasks: 0`, and null cursor; `completed` returns empty active
  arrays and `totalActiveTasks: 0`. Remove `completedPage` and
  `hasMoreCompleted`; all known TypeScript and Mobile callers migrate together.
- The active branch queries only `not_started`/`active`, excludes every
  personally hidden row (personal completion, personal unassignment, and board
  or list personal status `done`/`closed`), and never loads `review`/`done`
  history. Preserve all workspace/board/label/project/self-managed filters.
- `completedLimit` defaults to `20`, accepts integers
  `1..100`; malformed/out-of-range input or an invalid cursor returns
  `400 { "error": "Invalid completed-task pagination" }`.
- Replace numeric `completedPage` with an opaque base64url cursor containing
  strict unpadded JSON `{ "v": 1, "t": <ISO created_at or null>, "i": <UUID> }`.
  Order `(created_at DESC NULLS LAST, task_id DESC)`, query `limit + 1`, return
  at most `limit`, and derive a cursor only when the extra row exists. Null
  timestamps follow the same discriminator/mapping pattern as Plan 209.
- Add a dedicated actor-bound SQL function
  `public.get_user_completed_tasks_with_relations_page` that accepts the actor,
  current workspace/personal mode, all existing filter arrays, cursor fields,
  and limit. It must classify both list `review`/`done` and personally hidden
  tasks before paging, count the complete filtered set without relation JSON,
  page task IDs first, then build relation JSON only for the bounded page.
  Preserve every row field currently mapped by `RpcTaskRow`.
- Use this exact argument order, with defaults after the two required values:
  `p_user_id uuid, p_ws_id uuid, p_filter_ws_ids uuid[] default null,
  p_filter_board_ids uuid[] default null, p_filter_label_ids uuid[] default null,
  p_filter_project_ids uuid[] default null, p_filter_self_managed_only boolean
  default false, p_cursor_present boolean default false,
  p_cursor_created_at timestamptz default null, p_cursor_created_at_is_null
  boolean default false, p_cursor_task_id uuid default null, p_limit integer
  default 20`. Return the existing `RpcTaskRow` columns plus
  `total_completed_count bigint`. Reject limits outside `1..100`, incomplete or
  contradictory cursor fields, and actor mismatch inside the function. A null
  timestamp page has `p_cursor_present=true`,
  `p_cursor_created_at_is_null=true`, and a non-null task ID.
- Keep the existing active RPC for the active branch, with its existing direct
  authenticated contract unchanged. The new page function must enforce
  `p_user_id = auth.uid()` for authenticated calls and fail closed when there
  is no actor. Permit the explicit trusted branch only when
  `auth.role() = 'service_role'`; otherwise raise SQLSTATE `42501`. Revoke the
  exact signature from PUBLIC/anon and grant it only to `authenticated` and
  `service_role`.
- Put the page/cursor types and `listMyCompletedTasks` client in
  `packages/internal-api/src/my-tasks.ts`, export it from `src/index.ts`, and
  route Tasks UI through that facade. Existing active fetch may move to the
  same module without changing its response.
- Update Mobile to request `view=combined` for initial/refresh loads and
  `view=completed&completedCursor=...` for load more. Replace numeric state with
  nullable `nextCompletedCursor`; later completed pages must append only their
  completed rows and never overwrite active buckets.
- Update Rust to the identical strict query/envelope/RPC behavior. Because
  `users_me_tasks.rs` is already 1,154 lines, extract auth/query/shaping or page
  helpers into `apps/backend/src/users_me_tasks/*.rs` so every substantially
  edited/new Rust source is at most 700 lines. Add focused sibling tests and the
  exact GET operation to OpenAPI; do not mark production cutover.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$vercel-react-best-practices`,
`$tuturuuu-mobile-task-board`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root and `apps/backend/AGENTS.md`.
Execute from completed Plan 163 only after Plan 154 is green. Inventory all
callers first; Mobile and Rust are mandatory known consumers, while any
additional numeric-page consumer is a STOP requiring a versioned transition.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n 'completedPage|completedLimit|completedCursor|/api/v1/users/me/tasks' apps packages --glob '!plans/**'` | every collection caller is classified; no unsupported numeric-page consumer |
| Route | `bun --cwd apps/tasks vitest run 'src/app/api/v1/users/me/tasks/route.test.ts'` | active/completed separation, filters, cursor, bounds, errors, and auth pass |
| Client/UI | `bun --cwd packages/internal-api vitest run src/my-tasks.test.ts && bun --cwd packages/tasks-ui vitest run src/tu-do/my-tasks/__tests__/use-my-tasks-query.test.ts src/tu-do/my-tasks/__tests__/use-my-tasks-state.test.ts` | facade and infinite-cursor behavior pass |
| Mobile | `cd apps/mobile && flutter test test/data/repositories/task_repository_test.dart test/features/tasks/cubit/task_list_cubit_test.dart && flutter analyze` | combined initial load, cursor continuation, decoding/state, and analysis pass |
| Mobile canonical | `bun check:mobile` | Dart formatting, full analysis, and the complete Flutter test suite pass |
| Database focused | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/my-tasks-history-pagination.sql` | ACL, actor binding, classification, >1,000 rows, filters, ties/nulls, count, and pages pass |
| Database full/typegen | `bun --cwd apps/database sb:validate:isolated && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/my-tasks-history-pagination.sql` | full baseline and generated contract pass |
| Rust | `cargo test --manifest-path apps/backend/Cargo.toml users_me_tasks && bun check:backend` | query/envelope parity, auth modes, OpenAPI, native/Worker compile, and tests pass |
| Rust size | `test "$(wc -l < apps/backend/src/users_me_tasks.rs | tr -d ' ')" -le 700 && find apps/backend/src/users_me_tasks -name '*.rs' -exec sh -c 'test "$(wc -l < "$1" | tr -d " ")" -le 700' _ {} \;` | every edited/new Rust source is at most 700 lines |
| Types | `bun run --cwd apps/tasks type-check && bun run --cwd packages/internal-api type-check && bun run --cwd packages/tasks-ui type-check` | all affected TypeScript workspaces compile |
| Build/repository | `bun run --cwd apps/tasks build && bun check && git diff --check` | production build and canonical gates pass; whitespace is empty |

## Scope

**In scope:** the Tasks My Tasks collection route and new focused test; a new
internal-api My Tasks module/export/test; completed-query/state/list code and
focused tests; Mobile repository/model/cubit state plus focused repository and
cubit tests;
prepared Rust handler extraction/tests and OpenAPI GET; one additive page RPC
migration and pgTAP; generated database types only when isolated typegen changes
them.

**Out of scope:** task mutation/detail routes; active-bucket pagination or UI
redesign; changing filter, personal placement, personal hidden, due-date,
priority, or relation semantics; exact active count changes; Web handlers;
production Rust cutover; new visible strings unless unavoidable; server/client
auto-draining; offset pagination; production migration application; unrelated
Plan 079 work.

## Steps

1. Add red route, internal-api, UI, and pgTAP fixtures. Prove the current second
   page repeats full relation materialization, then freeze active/completed
   response separation, strict cursor encoding, and filter semantics.
2. Add the actor-bound completed-page RPC. In SQL, derive the eligible set and
   exact count, page IDs in stable order, and only then attach the current
   scheduling/override/list/assignee/label/project projection. Cover more than
   1,000 completed rows, ties, null timestamps, distractor users/workspaces,
   list-completed rows, and personal hidden rows.
3. Update the route so active mode excludes completed/history rows and
   completed mode calls only the bounded RPC. Inspect every RPC/override error;
   never return false empty state on source failure.
4. Add the typed facade and replace the numeric infinite query with cursor page
   params. Keep previously loaded pages visible, avoid duplicate requests, and
   reset completion pages when filters/workspace/personal mode change.
5. Update Mobile's repository/model/cubit to the same combined-initial and
   completed-cursor continuation contract. Update and split the Rust handler,
   add focused parity tests and OpenAPI, and keep both auth modes unchanged.
6. Run all focused, Mobile, Rust/backend, isolated database/typegen, typecheck, Tasks build,
   repository, whitespace, and exact-scope gates.

## Test plan

- Active mode never queries or returns review/done/personally hidden history.
- Completed mode never queries active buckets and returns no more than 100 rows.
- List-done and personally hidden rows appear exactly once across stable pages.
- More than 1,000 equal/mixed timestamp rows traverse without gaps/duplicates.
- Every existing filter and personal-workspace rule applies before count/page.
- Invalid limit/cursor and every source error are closed and sanitized.
- Infinite-query retries preserve loaded pages and use only the returned cursor.
- Mobile refresh loads combined buckets once; cursor load-more appends only
  completed rows. Rust emits byte-equivalent envelopes/statuses for each view.

## Done criteria

- [ ] No completed-page request materializes the complete task history or
      relation-hydrates rows outside its bounded page.
- [ ] Active requests no longer load review/done or personally hidden history.
- [ ] Tasks UI and Mobile use the opaque cursor; prepared Rust has exact parity.
- [ ] ACL, focused, >1,000-row, typegen, `bun check:mobile`, typecheck, build,
      `bun check`, and whitespace gates pass.
- [ ] No unrelated Tasks, Web, Rust, Mobile, or database artifact changed.

## STOP conditions

Stop if Plan 154 is not green, Tasks/Mobile/backend ownership is not transferred,
an additional numeric-page caller exists, current personal-hidden semantics cannot be
expressed before paging, exact count is product-optional but changing it needs
a product decision, existing SQL has drifted, or any mandatory gate fails twice.

## Maintenance notes

Pagination must happen before descriptions and relation aggregates. A cursor
over an array that was already fully materialized is not a bounded contract.
