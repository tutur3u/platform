# Plan 208: Retire Orphaned Web Tasks-Domain Forks

> **Executor instructions:** Prove the copied Web libraries have no runtime,
> test, config, dynamic, or package consumer, delete only that closed graph, and
> leave the Tasks-owned canonical implementations unchanged.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- apps/web/src/lib/habit-trackers apps/web/src/lib/tasks/public-task-board.ts apps/web/src/lib/tasks/public-task-board.test.ts apps/web/src/lib/tasks/default-personal-task-board.ts apps/web/src/lib/tasks/default-personal-task-board.test.ts apps/tasks/vitest.config.mts apps/tasks/src/test/server-only-stub.ts apps/tasks/src/lib/habit-trackers apps/tasks/src/lib/tasks tmp/agent-coordination`

## Status

- **Execution status:** TODO — transplant the retained scoped diff into a fresh
  worktree at verified integrated main `cdef1c5533`
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** architecture / satellite cutover / dead code
- **Depends on:** Plan 216 (DONE at final corrective commit `3a09b070ab`,
  integrated in `cdef1c5533`); coordinate with the active Tasks lane but do not
  touch its exact owned paths
- **Planned at:** commit `52f4aa1b12`, 2026-08-10

## Why this matters

Tasks is the documented and live owner for tasks, habits, and habit trackers,
but Web still compiles and tests 4,041 lines of copied domain code with no
consumer. Eleven files are byte-identical to their Tasks counterparts; the
twelfth, Web's `route-utils.ts`, is also unreferenced. Keeping the fork makes a
dead implementation look authoritative and adds avoidable Web verification
surface.

## Retained implementation status

Worktree
`/Users/skora/Documents/GitHub/tuturuuu/.worktrees/refactor-retire-web-tasks-forks`
contains exactly the planned twelve-file deletion at base `52f4aa1b12`, with no
commit. Setup passed; all eleven canonical pairs were byte-identical; Web and
repository reachability checks were clean; Tasks has zero diff. The mandatory
focused Tasks command failed twice before test collection because the existing
canonical `src/lib/tasks/public-task-board.ts` imports `server-only`, which
Vitest could not resolve from `public-task-board.test.ts`. Four other suites and
15 tests passed. Per the STOP rule, typechecks, builds, `bun check`, and commit
were not attempted. Resume this retained worktree only after the canonical test
harness/import boundary is dispositioned; do not repeat the deletion. Current
reconciliation identified the repository's established fix: Inventory aliases
`server-only` to an empty test stub in `apps/inventory/vitest.config.mts:10-15`.
Tasks has no dependency or alias for that marker despite directly testing a
server-only module. Add the equivalent Tasks test-only alias/stub, rerun the
failed gate, and continue the retained plan; do not add a production dependency.

The resumed executor added only that alias/stub and passed all five focused
files (16 tests) plus Web and Tasks typechecks. The mandatory combined build
then failed twice before Tasks build: the sandbox attempt also hit Google Font
network errors, while the approved network retry removed those and reproduced
the same unrelated `packages/utils/src/i18n-root-locale.ts:2` inability to
resolve `next/root-params` from middleware. Per the STOP rule, `bun check`,
final whitespace, staging, and commit were not run. Keep the refined worktree
intact. Plan 216 has since repaired and verified that base contract in final
corrective commit `3a09b070ab`, integrated in verified main `cdef1c5533`.
Transplant only the retained scoped diff into a fresh worktree at that exact
main, then rerun the remaining build/repository gates; do not rebase the
divergent dirty worktree, retry the stale base, or reimplement the fix.

## Current state and exact deletion set

- Delete all eight files under `apps/web/src/lib/habit-trackers/**`:
  `route-utils.ts`, `schemas.ts`, `schemas.test.ts`, `service.ts`,
  `service.test.ts`, `streaks.ts`, `streaks.test.ts`, and `templates.ts`.
- Delete the four Web files
  `apps/web/src/lib/tasks/{public-task-board,default-personal-task-board}.{ts,test.ts}`.
- The seven habit implementation/test files other than `route-utils.ts` and all
  four task-board files are byte-identical to the live Tasks copies. The Tasks
  routes/pages import those canonical copies.
- Do not delete or change Web's separately live `apps/web/src/lib/habits/**`
  feature/access helpers. Do not edit any Tasks source.
- The archived Tasks cutover records the full product/API migration as done at
  commit `5d499eeff9`; current docs name Tasks as canonical.
- `apps/tasks/vitest.config.mts` currently aliases internal packages but not the
  `server-only` marker. Add exact alias
  `{ find: 'server-only', replacement: resolve(__dirname, './src/test/server-only-stub.ts') }`
  and create `apps/tasks/src/test/server-only-stub.ts` containing only a comment
  explaining the jsdom test seam plus `export {}`. Match the existing Inventory
  exemplar; do not add `server-only` to the Tasks manifest or lockfile.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-validation-offload`, and `$tuturuuu-commit`. Read root, Web, and
Tasks AGENTS files. Treat existing worktree
`.worktrees/refactor-retire-web-tasks-forks` as a read-only patch source: verify
HEAD `52f4aa1b12`, no staged changes, and the exact 14-path scope (12 deletions
plus the Tasks alias/stub). Confirm `find apps/tasks/src/test -type f` returns
only `server-only-stub.ts`. Write the 13 tracked paths with `git diff --binary
HEAD -- <the exact tracked Scope paths>` to `/private/tmp/plan-208-cdef.patch`,
then append the untracked stub with `git diff --binary --no-index /dev/null
apps/tasks/src/test/server-only-stub.ts >> /private/tmp/plan-208-cdef.patch`
(exit 1 means the expected difference; any exit greater than 1 is a STOP).
Do not stash,
rebase, cherry-pick, reset, or mutate that divergent worktree. Create fresh
branch/worktree `refactor/retire-web-tasks-forks-cdef` at `cdef1c5533`, run
`bun setup` immediately, restore setup-only lock drift, then run `git apply
--check /private/tmp/plan-208-cdef.patch` and `git apply` there. Verify the fresh
diff is exactly the same 14 paths before deleting the temporary patch. Preserve
the old worktree until the new commit is integrated; then remove both completed
worktrees/branches under the normal post-merge cleanup rule. The active Tasks
production note owns named Tasks pages/routes but not this Web library tree; do
not expand into its paths.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Scoped transplant | `git status --short -- apps/web/src/lib/habit-trackers apps/web/src/lib/tasks/public-task-board.ts apps/web/src/lib/tasks/public-task-board.test.ts apps/web/src/lib/tasks/default-personal-task-board.ts apps/web/src/lib/tasks/default-personal-task-board.test.ts apps/tasks/vitest.config.mts apps/tasks/src/test/server-only-stub.ts` | exactly the 12 planned deletions, modified Vitest config, and one untracked stub before export; the same paths become tracked diff after apply |
| Web reachability | `rg -n 'lib/habit-trackers|habit-trackers/(schemas|service|streaks|templates|route-utils)|public-task-board|default-personal-task-board' apps/web/src --glob '!apps/web/src/lib/habit-trackers/**' --glob '!apps/web/src/lib/tasks/public-task-board*' --glob '!apps/web/src/lib/tasks/default-personal-task-board*'` | no matches before deletion; any match is a STOP until classified |
| Repository reachability | `rg -n 'apps/web/src/lib/habit-trackers|apps/web/src/lib/tasks/(public-task-board|default-personal-task-board)' . --glob '!plans/**' --glob '!tmp/agent-coordination/**'` | no config/script/package/dynamic consumer outside the deletion set |
| Absence | `test ! -e apps/web/src/lib/habit-trackers && test ! -e apps/web/src/lib/tasks/public-task-board.ts && test ! -e apps/web/src/lib/tasks/default-personal-task-board.ts` | exit 0 after deletion |
| Canonical Tasks tests | `bun --cwd apps/tasks vitest run src/lib/habit-trackers/schemas.test.ts src/lib/habit-trackers/service.test.ts src/lib/habit-trackers/streaks.test.ts src/lib/tasks/public-task-board.test.ts src/lib/tasks/default-personal-task-board.test.ts` | all five files collect and pass; no `server-only` resolution error |
| Typechecks | `bun run --cwd apps/web type-check && bun run --cwd apps/tasks type-check` | both exit 0 |
| Builds | `bun run --cwd apps/web build && bun run --cwd apps/tasks build` | both production builds exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** deletion of exactly the twelve Web files listed above; update
`apps/tasks/vitest.config.mts`; create the empty test-only
`apps/tasks/src/test/server-only-stub.ts`. **Read-only evidence:** Tasks
production copies/tests, Inventory's alias/stub exemplar, Tasks docs, and the
archived cutover note. **Out of scope:** any Tasks production implementation or
test assertion edit, Web `lib/habits/**`, manifests/lockfile, API routes,
behavior changes, dependency cleanup, navigation, translations, database,
route manifests, or generated files.

## Steps

1. Run both reachability commands and compare all eleven claimed identical
   pairs with `cmp -s`. Confirm `route-utils.ts` has zero consumer. Record the
   twelve-file/4,041-line baseline. Any external importer is a STOP.
2. In the retained worktree, keep exactly the closed Web file deletion. Do not move or
   re-export the code and do not touch the canonical Tasks copies. Verify the
   absence and repeat both reachability commands.
3. Add the Tasks Vitest alias and empty stub exactly as specified, following the
   Inventory exemplar. Verify `git diff -- apps/tasks` contains only those two
   test-harness paths and rerun the canonical focused command; all five files
   must collect and pass.
4. Run both typechecks, both production
   builds, `bun check`, `git diff --check`, and a final status/scope audit.

## Done criteria

- [ ] All twelve orphaned Web files and 4,041 dead lines are absent.
- [ ] The canonical Tasks implementation/test files remain byte-for-byte
  unchanged and their focused tests pass.
- [ ] Tasks production code and assertions remain unchanged; only its Vitest
  alias and empty test stub are added.
- [ ] No Web/config/script/package consumer references the retired paths.
- [ ] Web and Tasks typechecks/builds, repository, and whitespace gates pass.

## STOP conditions

Stop if any external or dynamic consumer exists, a claimed canonical pair is no
longer equivalent in behavior, a Tasks production/test assertion or dependency
edit is required, active ownership expands onto the Web deletion/test-harness
paths, the alias does not make the exact five-file command collect, or any
mandatory gate fails twice in the resumed executor run.
