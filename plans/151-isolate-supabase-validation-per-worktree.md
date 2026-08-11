# Plan 151: Isolate Supabase Validation per Exact-Base Worktree

> **Executor instructions:** Add a disposable Supabase validation mode whose
> Docker identity, ports, schema history, and cleanup are isolated from the
> developer's default stack and every other worktree.
>
> **Drift check (run first):**
> `git diff --stat 558397b971..HEAD -- apps/database/scripts/run-supabase.js apps/database/scripts/run-supabase.test.js apps/database/scripts/run-supabase-isolated.js scripts/run-supabase-isolated.test.js apps/database/package.json apps/docs/build/development-tools/local-supabase-development.mdx tmp/agent-coordination`

## Status

- **Execution status:** DONE
- **Completed by:** reviewed commit `132a9e3ebb` on
  `chore/isolate-supabase-validation`; focused 23/23, discovered script suite
  1,349/1,349, isolated real smoke, default-stack equality, full `bun check`,
  JSON, whitespace, and commit-hook gates passed
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** dx / tooling
- **Depends on:** reviewed Plan 004 commit `558397b971`, whose canonical script-
  test discovery automatically enrolls the new root `scripts/*.test.js`, plus
  reviewed Plan 152 commit `f2c74af4b2`; do not alter or reset the existing
  default local stack
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from `558397b971`
  with `f2c74af4b2` incorporated before implementation

## Why this matters

Every checkout uses project id `tuturuuu` and the same fixed port set, so all
worktrees address one Docker-backed Supabase stack. Applying a newer migration
from one checkout makes exact-base validation impossible in another without a
shared destructive reset. This currently blocks Plans 086 and 145 directly and
Plans 105/115 transitively.

## Current state

- `supabase/config.toml` fixes one project id plus API, database, shadow,
  pooler, Studio, Inbucket, analytics, and inspector ports.
- `run-supabase.js` only resolves the pinned CLI binary and forwards arguments
  from `apps/database`; it has no isolated identity/config lifecycle.
- Mandatory database plans use exact-base worktrees but the local Docker state
  is newer than those bases.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-database`, `$supabase`,
`$tuturuuu-ci-docs`, `$tuturuuu-agent-coordination`, and `$tuturuuu-commit`.
Read root/database `AGENTS.md` and the database/tooling references completely.
Create the isolated Git worktree at reviewed Plan 004 commit `558397b971` and
run `bun setup` immediately. Claim the commit window, cherry-pick reviewed Plan
152 commit `f2c74af4b2`, release the window, and verify that only its three
documented files were incorporated. Do not reimplement or omit Plan 004's
script-test discovery.
Inventory active Docker/Supabase stacks read-only; the implementation must not
stop, reset, rename, or reuse any existing project.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused | `node --test apps/database/scripts/run-supabase.test.js scripts/run-supabase-isolated.test.js` | identity/config/lifecycle cases pass |
| Script discovery | `bun test:scripts --list` | includes `scripts/run-supabase-isolated.test.js` |
| Script suite | `bun test:scripts` | all discovered script tests pass |
| Disposable smoke | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/workspace-creator-membership.sql` | fresh isolated stack applies exact-base migrations, tests, and stops |
| Default safety | `bun --cwd apps/database sb:status` | pre-existing default stack state is unchanged |
| Repository | `bun check` | exit 0 |
| JSON | `python3 -m json.tool apps/database/package.json >/dev/null` | manifest parses |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** isolated runner; root-discovered focused test at
`scripts/run-supabase-isolated.test.js`; narrow reusable exports from the
existing CLI wrapper; database-workspace script alias; local-Supabase
development runbook.

**Out of scope:** changing default `config.toml` values, dependency additions,
production/linked Supabase operations, stopping/resetting existing stacks,
migration contents, generated database types, CI Docker services.

## Git workflow

Use `chore/isolate-supabase-validation` and commit
`chore(database): isolate worktree validation`. Claim/release the commit window;
do not push and never stage generated disposable state.

## Steps

### Step 1: Specify deterministic identity and complete port allocation

Create pure helpers that derive a Docker-safe project id from the repository
path plus exact Git base/HEAD, with a short stable hash to prevent basename
collisions. Allocate a contiguous, deterministic port block and rewrite every
active port field in the current config: API, DB, shadow DB, pooler, Studio,
Inbucket, edge inspector, and analytics. Assert each expected key is found once;
fail closed if the upstream config adds/removes a port instead of silently
sharing one. Detect a port/project collision before start and choose a bounded
documented alternate slot or fail without touching the colliding stack.

**Verify:** unit tests cover two worktrees at the same SHA, one worktree at two
bases, deterministic reruns, all port fields, collision, malformed config, and
Docker-safe length/characters.

### Step 2: Build a disposable project without mutating tracked files

Stage a complete temporary Supabase project under an OS temp directory using
the tracked config, migrations, seed, templates, and other CLI-required files.
Rewrite only the temporary config. Never edit `supabase/config.toml`, create
tracked output, or share migration state. Expose the existing binary resolver
and injected runner rather than duplicating CLI installation logic.

**Verify:** fixture tests compare source hashes before/after, prove the staged
migration set matches the exact-base checkout, and reject paths outside the
created disposable root during cleanup.

### Step 3: Own the full validation lifecycle

Add one canonical `bun --cwd apps/database sb:validate:isolated` entry point in
the database workspace that starts the unique stack, applies the exact
checkout's migrations, runs either the full pgTAP suite or a validated repo-
relative `--test` path, and stops/removes only its own stack in `finally`.
Record lifecycle metadata inside the disposable root so an
interrupted run can be identified and explicitly resumed/cleaned. Signal
handlers must request scoped cleanup and preserve the original failure code.
Never invoke the default `sb:stop`, `sb:reset`, or Docker-wide cleanup.

**Verify:** injected-runner tests cover success, start failure, migration
failure, test failure, signal/interrupt, repeated cleanup, and a second isolated
run operating concurrently without command/port overlap.

### Step 4: Document exact-base validation and recovery

Update the local Supabase runbook with the isolated command, full/focused
examples, disposable location, identity display, interrupt recovery, and the
rule that exact-base executor gates use this mode when the default stack has
incompatible migration history. Keep ordinary developer `sb:start/up/reset`
behavior unchanged. Do not change plugin skills in this plan; propagating the
workflow into the plugin would require the separate plugin-doc synchronization
and validation contract.

**Verify:** commands in the docs are copied into focused tests or checked
against registered package scripts; no invalid `bun --cwd ... run` form remains.

### Step 5: Run mandatory gates and one real smoke

Run pure tests and prove Plan 004 discovers the new suite before Docker.
Snapshot the default `sb:status`, execute one
isolated focused validation, then prove the default status and tracked config
are unchanged and no disposable stack remains. Finish with `bun test:scripts`,
`bun check`, JSON, and whitespace gates.

## Done criteria

- [ ] Two worktrees can validate different migration histories concurrently.
- [ ] Every Supabase/Docker identity and active port is isolated deterministically.
- [ ] Success, failure, and interruption clean only the owned disposable stack.
- [ ] Default developer stack/config and generated types remain untouched.
- [ ] Focused/full pgTAP selection and recovery are documented and tested.
- [ ] Pure tests, real disposable smoke, script suite, and repository gates pass.

## STOP conditions

Stop if complete CLI isolation requires mutating the default config/stack,
Docker project ownership cannot be proven before cleanup, a port/config field
cannot be isolated, an active note claims an exact tooling path, the smoke would
destroy shared state, or the same mandatory gate fails twice.
