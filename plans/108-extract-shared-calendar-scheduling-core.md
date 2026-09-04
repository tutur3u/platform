# Plan 108: Extract One Shared Calendar Scheduling Core

> **Executor instructions:** Replace the byte-identical Calendar, Tasks, and
> Web scheduling copies with one server-only package in behavior-preserving
> stages. Keep app route contracts and app-specific persistence/provider seams
> local. Split every substantially edited source module below 700 LOC.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/calendar/src/lib/calendar apps/tasks/src/lib/calendar apps/web/src/lib/calendar packages/calendar-core apps/calendar/package.json apps/tasks/package.json apps/web/package.json bun.lock`
> Stop on scheduler, preview, dependency, or lockfile drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** L
- **Risk:** HIGH
- **Category:** tech-debt
- **Depends on:** Tasks, Calendar follow-up, and lockfile ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Twenty-six scheduling files are byte-identical across Calendar, Tasks, and Web:
10,153 lines per app and 20,306 excess duplicate lines. Core modules are 2,398,
1,971, 1,285, and 718 lines, so every scheduling fix must be replayed across
three runtimes and several files already exceed the repository ceiling.

## Current state

- The identical cluster includes `unified-scheduler.ts` (2,398 lines),
  `unified-scheduler/preview-engine.ts` (1,971), `habit-scheduler.ts` (1,285),
  `task-scheduler.ts` (718), and 22 supporting/test modules.
- `apps/tasks/.../tasks/[taskId]/schedule/route.ts:9` imports the Tasks copy;
  `apps/calendar/.../calendar/schedule/route.ts:31` imports the Calendar copy.
- `20260703-184620-claude-calendar-app-migration.md` records that Web's copy was
  retained for Tasks/Habits and identifies cleanup as follow-up.
- The identical preview test is itself 1,143 lines; Web also has
  `calendar-all-day-events.test.ts` and
  `calendar-smart-schedule-timezone.test.ts` consuming the local implementation.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-development-tooling`. Remain blocked while Tasks/release lanes own
the copied paths or Mail owns `bun.lock`. Reconfirm Calendar follow-up ownership
and create one coordination note naming the exact extraction slice before any
move.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Add package dependencies | `cd packages/calendar-core && bun add server-only '@tuturuuu/ai@workspace:*' '@tuturuuu/supabase@workspace:*' '@tuturuuu/types@workspace:*'` | new package manifest/lockfile contain only required runtime edges |
| Add package tooling | `cd packages/calendar-core && bun add --dev '@tuturuuu/typescript-config@workspace:*' typescript vitest` | package tests/typecheck are self-contained |
| Add app dependencies | `cd apps/calendar && bun add '@tuturuuu/calendar-core@workspace:*' && cd ../tasks && bun add '@tuturuuu/calendar-core@workspace:*' && cd ../web && bun add '@tuturuuu/calendar-core@workspace:*'` | all three app manifests and lockfile contain the workspace edge |
| Package tests | `bun run --cwd packages/calendar-core test` | extracted characterization suite passes |
| Package typecheck | `bun run --cwd packages/calendar-core type-check` | exit 0 |
| Calendar tests | `bun --cwd apps/calendar vitest run src/lib/calendar` | facade and route-facing scheduler tests pass |
| Tasks tests | `bun --cwd apps/tasks vitest run src/lib/calendar` | facade and route-facing scheduler tests pass |
| Web tests | `bun run --cwd apps/web test -- src/lib/calendar src/__tests__/calendar-all-day-events.test.ts src/__tests__/calendar-smart-schedule-timezone.test.ts` | Web scheduling tests pass |
| App typechecks | `bun run --cwd apps/calendar type-check && bun run --cwd apps/tasks type-check && bun run --cwd apps/web type-check` | all exit 0 |
| App builds | `bun run --cwd apps/calendar build && bun run --cwd apps/tasks build && bun run --cwd apps/web build` | all exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Duplicate check | `rg -l "export .*UnifiedScheduler|class UnifiedScheduler" apps/calendar/src/lib/calendar apps/tasks/src/lib/calendar apps/web/src/lib/calendar` | only intentional thin facades, or no matches |
| Whitespace | `git diff --check` | no output |

## Scope

- create private server-only package `packages/calendar-core/**`
- the 26 byte-identical files under each of
  `apps/{calendar,tasks,web}/src/lib/calendar/`, migrated in bounded slices
- thin app-local facades/adapters needed to preserve existing import paths
- `apps/calendar/package.json`, `apps/tasks/package.json`,
  `apps/web/package.json`, and `bun.lock`, changed only through Bun dependency
  commands
- focused scheduling tests and `plans/README.md` only for status

Do not change route responses, schedule scoring, timezone/DST semantics,
encryption envelopes, provider payloads, database schema, UI, or migration
tracking.

## Git workflow

Use branch `refactor/shared-calendar-scheduler` in an isolated worktree and run
`bun setup`. Commit small behavior-preserving slices, ending with
`refactor(calendar): share scheduling core`. Claim the commit window before
each staging/commit operation; do not push unless instructed.

## Steps

### Step 1: Freeze identical behavior

Hash all 26 triples and record the exact list in a package test fixture. Move
the common preview/scheduling fixtures into the new package without changing
assertions. Split the 1,143-line copied preview test into focused files before
moving production code.

### Step 2: Create the server-only package

Create `@tuturuuu/calendar-core` with explicit subpath exports, `server-only`,
Vitest, and typecheck scripts. Add it to Calendar, Tasks, and Web using the
exact Bun commands above; do not manually edit dependency fields. Author the new
package manifest/config first using the nearest server-only package as the
structural exemplar, then let Bun add its runtime dependencies. Keep provider,
Supabase, encryption, and logging dependencies injectable rather than importing
app aliases.

### Step 3: Extract pure modules first

Move timezone, priority, field-limit, OAuth URL, schedule-policy, skip, and
preview/scoring modules into focused package files below 700 LOC. Replace each
app copy with a thin re-export so existing imports remain stable. Run package
and all three app-focused tests after every slice.

### Step 4: Extract orchestration through adapters

Define typed persistence, task-source, encryption, token-refresh, and provider
ports. Move habit/task/unified orchestration behind those ports, splitting the
oversized files by responsibility. Each app facade supplies its existing local
adapters; no core code may import `@/` aliases or an app route.

### Step 5: Remove duplicate implementations

After all callers use the package, leave only documented thin facades where
stable import paths are required and delete the copied implementation/test
bodies. Prove the duplicate check and hash inventory no longer show three
production copies.

### Step 6: Run full gates

Run package/app tests and typechecks, all three production builds, `bun check`,
the duplicate check, and whitespace validation. Inspect `bun.lock` and manifests
for only the three intended workspace edges.

## Done criteria

- [ ] One server-only package owns scheduling and preview behavior.
- [ ] Calendar, Tasks, and Web retain stable route behavior through thin adapters/facades.
- [ ] No substantially edited source/test module exceeds 700 LOC.
- [ ] The 20,306-line triple-copy implementation is removed.
- [ ] Package/app tests, typechecks, three builds, repository gate, and whitespace pass.

## STOP conditions

Stop until all exact owners and the lockfile owner transfer their paths. After
transfer, stop if the copies are no longer behavior-identical, an adapter needs
new public behavior, a dependency command changes unrelated lockfile entries,
an app-specific secret/provider implementation would enter the shared core, or
a gate fails twice.

## Maintenance notes

Keep the package a scheduling domain boundary, not a dumping ground for Calendar
UI or route logic. Pure rules belong in core; credentials, persistence, and
provider effects remain injected by owning apps.
