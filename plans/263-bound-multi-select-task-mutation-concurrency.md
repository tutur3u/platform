# Plan 263: Bound Multi-Select Task Mutation Concurrency

> **Executor instructions:** Keep the existing per-task API and optimistic
> rollback semantics, but first split the oversized action hook into focused
> modules, then replace eligible serial multi-select mutation loops with one
> shared four-wide Effect runner and prove partial failures remain truthful.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/tasks-ui/src/hooks/use-task-actions.ts packages/tasks-ui/src/hooks/use-task-status-actions.ts packages/tasks-ui/src/hooks/use-task-field-actions.ts packages/tasks-ui/src/hooks/use-task-relation-actions.ts packages/tasks-ui/src/hooks/task-action-concurrency.ts packages/tasks-ui/src/hooks/__tests__/use-task-actions.test.tsx packages/tasks-ui/src/hooks/__tests__/task-action-concurrency.test.ts tmp/agent-coordination`

## Status

- **Execution status:** TODO
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** performance / client orchestration
- **Depends on:** no active exact-path owner; coordinate adjacent Tasks work
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Multi-select completion, close, delete, list move, due date, priority, and
estimation changes await one no-store task PUT at a time. Selection has no small
hard bound, so latency grows linearly even though these operations are
independent. The 1,910-line hook is also far above the 700-line hard ceiling, so
changing all loops in place would deepen an architectural violation. Existing
per-task success, rollback, broadcast, and partial-result semantics are not
tested under overlap.

## Exact contract

- Add `runTaskActionBatch` in `task-action-concurrency.ts`, implemented with
  `@tuturuuu/utils/effect` (`forEachConcurrently`, `Effect.tryPromise`, and
  `Effect.either`). Its fixed exported ceiling is `4`; callers cannot request
  unbounded execution. It returns an input-order array of discriminated
  `{ taskId, ok: true, value } | { taskId, ok: false, error }` results and never
  rejects because one item failed.
- Before behavior changes, split the hook into `use-task-status-actions.ts`
  (completion/close/delete/list movement), `use-task-field-actions.ts`
  (due date/priority/estimation and closely coupled field helpers), and
  `use-task-relation-actions.ts` (assignee and other relation handlers, moved
  without semantic change). Keep `use-task-actions.ts` as the stable composing
  export. Every authored module, including the facade, must be <=700 LOC.
- Enroll only independent per-task PUT loops: completion, close, delete,
  ordinary list move, due date, priority, and estimation. Assignee/relation
  mutation remains behavior-preserving and serial in this plan because its
  current partial-failure behavior is not truthful enough to parallelize safely.
  Preserve external/personal task classification and any required preflight
  ordering before launching workers.
- Preserve one request per task so database triggers still fire. Preserve
  per-task rollback, successful-task broadcasts, invalidation, sound count,
  and exact all-failed/partial/all-success toast behavior. Do not clear the
  user's selection automatically.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Re-run the loop inventory and inspect the working Tasks note;
its current exact owned paths do not include `packages/tasks-ui`, but coordinate
before execution. No API, migration, or dependency change is authorized.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused runner/hook | `bun --cwd packages/tasks-ui vitest run src/hooks/__tests__/task-action-concurrency.test.ts src/hooks/__tests__/use-task-actions.test.tsx` | ceiling, ordering, partial failure, rollback, broadcasts, and extraction compatibility pass |
| Source ceiling | `node -e "const fs=require('fs'); for(const f of process.argv.slice(1)) if(fs.readFileSync(f,'utf8').split(/\\r?\\n/u).length>700) throw new Error(f)" packages/tasks-ui/src/hooks/use-task-actions.ts packages/tasks-ui/src/hooks/use-task-status-actions.ts packages/tasks-ui/src/hooks/use-task-field-actions.ts packages/tasks-ui/src/hooks/use-task-relation-actions.ts packages/tasks-ui/src/hooks/task-action-concurrency.ts` | exits 0 only when every listed authored module is at most 700 lines |
| Package test/typecheck | `bun run --cwd packages/tasks-ui test && bun run --cwd packages/tasks-ui type-check` | package suite and types pass |
| Tasks build | `bun run --cwd apps/tasks build` | consuming app builds |
| Repository | `bun check && git diff --check` | all checks and whitespace pass |

## Scope

In scope: the stable hook facade; the three exact extracted hooks; one pure
concurrency module; its focused test; extensions to the existing hook test.
Out of scope: new bulk endpoints/RPCs, selection UX caps, server-side
authorization, task schema, external-provider batching, automatic retries,
assignee/relation behavior changes, or changing operation envelopes.

## Steps

1. Characterize all seven listed actions with at least one multi-select success
   and representative partial/all-failure cases. Record any loop whose next
   request depends on the prior response; leave that loop serial and report it
   rather than forcing it into the runner.
2. Add red pure tests that gate maximum in-flight work at four, preserve result
   order despite out-of-order completion, collect failures, and continue after
   rejection. Use controlled promises, not timing-only assertions.
3. Extract the three focused hooks while preserving the public
   `useTaskActions` return type/import. Keep each file under 700 LOC and run the
   existing focused suite before changing concurrency.
4. Implement the Effect runner and replace each eligible serial loop. Consume
   the result array through the existing rollback/broadcast/toast logic rather
   than duplicating it inside workers.
5. Add hook tests proving successful tasks stay optimistic, failed tasks roll
   back individually, only successes broadcast, external-task workspace/list
   routing remains correct, and all-failed behavior still restores the full
   previous state.
6. Run focused/full package tests, source ceiling, typecheck, Tasks build, `bun check`,
   whitespace, and exact-scope review.

## Done criteria

- [ ] The stable hook facade and every extracted module remain at or below 700 LOC.
- [ ] Every eligible multi-select action has at most four in-flight task mutations.
- [ ] One failure does not stop remaining tasks or misreport successes.
- [ ] Per-task triggers, routing, rollback, broadcasts, invalidation, sounds, and toasts are preserved.
- [ ] No new API/schema/dependency or automatic retry is introduced.
- [ ] Focused/full tests, typecheck, build, repository, and scope gates pass.

## STOP conditions

Stop if the stable hook cannot be split under 700 LOC without changing its
public API; if a listed operation has a real cross-task ordering dependency; if the
Effect helper cannot run in the client bundle without adding a dependency; if
the active Tasks owner claims these exact paths; if bounded overlap changes
external-task routing or provider rate behavior; or if a mandatory gate fails
twice.
