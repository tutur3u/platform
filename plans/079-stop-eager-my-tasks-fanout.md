# Plan 079: Stop Eager My Tasks Cross-Workspace Fan-Out

> **Executor instructions:** Reuse the current-user board summary, remove the
> duplicate workspace read, and load labels/projects only when their UI needs
> them. Preserve cross-workspace filters and guest-visible boards.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/tasks-ui/src/tu-do/my-tasks/use-my-tasks-state.ts packages/tasks-ui/src/tu-do/my-tasks/__tests__/use-my-tasks-state.test.ts packages/internal-api/src/tasks.ts packages/internal-api/src/tasks.test.ts`
> Stop on My Tasks filter, query-key, or current-user board contract drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Tasks production build repeatedly fails in the
  current execution environment with Turbopack `EPERM` while creating its CSS
  worker process/internal port; reviewed uncommitted work remains in
  `.worktrees/perf-lazy-my-tasks-filters`
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Performance / client data loading
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Opening personal My Tasks currently makes two workspace-list calls, walks every
board page in every workspace, and eagerly downloads every workspace's labels
and projects. Initial request count is at least `2 + 3W`, grows further with
board pagination, and materializes data the user may never open.

## Current state

- `packages/tasks-ui/src/tu-do/my-tasks/use-my-tasks-state.ts:238-280` loads
  workspaces once, then loads them again and walks 200-row board pages for every
  workspace concurrently.
- The same hook at `:401-432` eagerly calls label and project endpoints once per
  workspace whenever the personal view mounts.
- `packages/internal-api/src/tasks.ts:1211-1227` already exposes
  `listCurrentUserTaskBoards`, a centralized accessible-board summary used by
  other consumers.
- `packages/tasks-ui/.../__tests__/use-my-tasks-state.test.ts` already owns the
  hook query mocks and is the focused regression surface.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Confirm no active
note claims the exact `packages/tasks-ui` My Tasks hook/test or internal API
facade/test, then run `git status --short`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Hook tests | `bun run --cwd packages/tasks-ui test -- src/tu-do/my-tasks/__tests__/use-my-tasks-state.test.ts` | query enablement/count and filter cases pass |
| Internal API tests | `bun run --cwd packages/internal-api test -- src/tasks.test.ts` | current-user board contract passes |
| Tasks UI types | `bun run --cwd packages/tasks-ui type-check` | exit 0 |
| Internal API types | `bun run --cwd packages/internal-api type-check` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Repository gate | `bun check` | exit 0, or only a documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/tasks-ui/src/tu-do/my-tasks/use-my-tasks-state.ts`
- `packages/tasks-ui/src/tu-do/my-tasks/__tests__/use-my-tasks-state.test.ts`
- `packages/tasks-ui/src/tu-do/my-tasks/label-project-filter.tsx`
- `packages/tasks-ui/src/tu-do/my-tasks/command-bar.tsx`
- `packages/tasks-ui/src/tu-do/my-tasks/my-tasks-content.tsx`
- `packages/tasks-ui/src/tu-do/my-tasks/my-tasks-filters.tsx` only to preserve
  optional callback compatibility for existing My Tasks consumers
- Focused component tests beside or under the existing My Tasks test tree for
  selector-open callback wiring and cached reopen behavior
- `packages/internal-api/src/tasks.ts` and `src/tasks.test.ts` only if the
  existing current-user summary lacks a field already required by My Tasks
- `plans/README.md` only for status

The component changes are limited to threading explicit label/project demand
signals into the hook; do not move filter state or redesign the controls. Do
not add a new endpoint or database migration unless the existing summary is
proved insufficient and the plan is revised first. Do not change task results,
filter semantics, auto-board creation, or unrelated Tasks components.

## Git workflow

Use branch `perf/lazy-my-tasks-filters` in an isolated worktree; run
`bun setup`. Commit `perf(tasks): reduce my tasks workspace fanout`. Claim the
commit window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize request counts and visible choices

Extend the hook test with zero, one, and many workspaces. Assert the current
board/label/project options, guest-visible boards, selected filter retention,
and the exact calls made at initial mount versus opening each selector. Do not
encode implementation-only render counts.

### Step 2: Reuse the current-user board summary

Replace the second `listWorkspaces` plus per-workspace pagination loop with
`listCurrentUserTaskBoards`. Map only the existing `id`, `name`, and `ws_id`
shape and retain deleted-board filtering if the central contract does not
already guarantee it. Use the first workspace query as the single workspace
source for the rest of the hook.

### Step 3: Make filter catalogs demand-driven

Enable cross-workspace label requests only while the label filter control is
opened (or when a persisted label selection needs resolution). Apply the same
rule to projects and the project selector/create flow. Cache successful results
under stable workspace-ID query keys so reopening does not refetch solely due
to array identity. Keep selected values renderable after the menu closes.

### Step 4: Verify bounded initial work

Prove initial personal-view loading no longer scales by three requests per
workspace: one workspace query plus one current-user board summary is the
target before an optional selector opens. Run focused tests, both typechecks,
the real Tasks build, and `bun check`.

## Test plan

- Initial mount calls workspaces once and current-user boards once.
- Board summary retains accessible/guest boards and excludes deleted boards.
- Labels/projects issue no request until needed; opening each loads every
  authorized workspace once and cached reopen does not refetch.
- Persisted selections resolve without disappearing when controls are closed.
- Workspace zero/one/many and request failures have stable empty/error behavior.

## Done criteria

- [ ] Initial My Tasks request count no longer grows as `2 + 3W`.
- [ ] Board pagination fan-out is replaced by the governed summary.
- [ ] Label/project catalogs are demand-driven without filter regressions.
- [ ] Focused tests, types, Tasks build, `bun check`, and whitespace pass.
- [ ] No new endpoint, migration, or unrelated Tasks surface changed.

## STOP conditions

Stop if the summary omits required authorization semantics, product requires
fully populated labels/projects before controls open, exact paths gain active
ownership, or a required gate fails twice.

## Maintenance notes

Cross-workspace views need aggregate contracts and demand-driven catalogs;
browser-side per-workspace fan-out is not a scalable discovery mechanism.
