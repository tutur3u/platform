# Plan 163: Generate Database Types from the Disposable Supabase Stack

> **Executor instructions:** Extend Plan 151's validator so a migration can be
> applied, tested, and type-generated from the same disposable stack without
> reading or mutating the developer's default Supabase project.
>
> **Drift check (run first):**
> `git diff --stat 132a9e3ebb..HEAD -- apps/database/scripts/run-supabase-isolated.js scripts/run-supabase-isolated.test.js apps/database/package.json apps/docs/build/development-tools/local-supabase-development.mdx tmp/agent-coordination`

## Status

- **Execution status:** DONE — reviewed commit `3f61e928ea` on
  `chore/isolated-supabase-typegen`
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** DX / database / tooling
- **Depends on:** Plan 151 (DONE); execute from reviewed commit `132a9e3ebb`
- **Planned at:** commit `60e33aebd9`, 2026-08-10; implementation base
  `132a9e3ebb`

## Why this matters

Plan 151 isolates migration and pgTAP validation, but its lifecycle always
destroys the stack after tests and offers no type-generation phase. Migration
plans otherwise have to run `sb:typegen` against the unrelated default local
project, recreating the exact cross-worktree ownership problem isolation fixed.

## Current state

- `apps/database/scripts/run-supabase-isolated.js` stages tracked Supabase
  files, starts a unique project, resets, tests, stops, and deletes it.
- `parseArguments` supports only `--cleanup`, `--resume`, and `--test`.
- `runIsolatedLifecycle` uses an injected runner and preserves the original
  failure code through scoped cleanup, but has no buffered typegen step.
- The default `sb:typegen` uses `--local`, which addresses the fixed default
  project rather than the disposable workdir.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-database`, `$supabase`,
`$tuturuuu-ci-docs`, `$tuturuuu-agent-coordination`, and `$tuturuuu-commit`.
Read root/database AGENTS and Plan 151. Create the worktree from `132a9e3ebb`,
run `bun setup`, and fingerprint the default Supabase config/containers before
the real smoke.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `node --test scripts/run-supabase-isolated.test.js` | argument, output-safety, lifecycle, cleanup, and failure cases pass |
| Discovery | `bun test:scripts --list` | focused test is listed via Plan 004 discovery |
| Real smoke | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/habit-tracker-write-rls.sql` | committed exact-base test passes; types are generated before scoped cleanup |
| Script suite | `bun test:scripts` | all script tests pass |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** isolated runner and root-discovered test; database package alias
only if needed for exact CLI forwarding; local Supabase runbook.

**Out of scope:** generated types themselves, migrations, default-stack
start/reset/stop, linked/project typegen, production apply, generic shell
execution, or retaining a disposable stack after a successful run.

## Git workflow

Use `chore/isolated-supabase-typegen` and commit
`chore(database): generate types from isolated validation`. Claim/release the
commit window; do not push.

## Steps

1. Add `--typegen <repo-relative-output>` parsing. Resolve the output inside
   the repository, require the exact approved generated-types path, reject
   traversal/symlinks/directories, and store no output path outside lifecycle
   metadata.
2. After reset and successful pgTAP tests, invoke the same Supabase binary with
   `--workdir <disposableRoot> gen types typescript --local --schema
   public,private,storage`; capture stdout without logging credentials and write
   the target atomically only on exit 0.
3. Preserve failure ordering: reset or pgTAP failure never invokes typegen or
   changes the tracked output; a later typegen failure retains its code and
   still performs scoped stop/root cleanup. Test signal, cleanup failure,
   empty output, write failure, repeated invocation, and default-state safety.
4. Run the real focused smoke and prove the default project container ids,
   status, ports, and tracked config hash are unchanged; prove no disposable
   containers/root remain.
5. Document the command, then run focused, discovery, full script, repository,
   JSON/whitespace, and exact-scope gates.

## Done criteria

- [ ] Type generation uses the disposable workdir that applied the migration.
- [ ] Only the exact approved repo-relative output path is writable.
- [ ] Output replacement is atomic and failure never leaves partial types.
- [ ] Scoped cleanup and original exit-code behavior remain intact.
- [ ] The real smoke leaves the default stack/config and Docker inventory
      unchanged; all mandatory gates pass.

## STOP conditions

Stop on Plan 151 drift, inability to prove output containment, any secret in
captured output/logs, default-stack mutation, orphaned disposable resources,
need for generic command execution, or any gate failing twice.
