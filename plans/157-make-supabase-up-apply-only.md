# Plan 157: Make `sb:up` Apply Migrations Only

> **Executor instructions:** Align the root Supabase alias with the database
> workspace and documented workflow so applying migrations does not
> automatically rewrite the repository-wide generated type file.
>
> **Drift check (run first):**
> `git diff --stat 132a9e3ebb..HEAD -- package.json scripts apps/database/package.json apps/database/scripts apps/docs plugins/tuturuuu/skills/tuturuuu-database tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** DX / tooling
- **Depends on:** exact root `package.json` transfer from the active Forms
  migration handoff and archival/transfer of the top-level completed Hive/Mind
  note that still claims the root manifest
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from reviewed Plan
  151 commit `132a9e3ebb`

## Why this matters

The database workspace defines migration application and type generation as
separate commands, but root `sb:up` chains both. Policy-only migration work
therefore rewrites `packages/types/src/supabase.ts`, creating unnecessary dirty
state and collisions with active generated-type owners.

## Current state

- Root `sb:up` is `cd apps/database && bun sb:up && bun sb:typegen`.
- `apps/database` separately exposes `sb:up` and `sb:typegen`.
- Root policy and the database workflow describe apply first and typegen after
  schema changes; Plans 086 and 105 explicitly expect policy-only apply to
  produce zero generated-type drift.
- No root script contract test protects which Supabase aliases mutate generated
  artifacts.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-database`,
`$tuturuuu-ci-docs`, `$tuturuuu-agent-coordination`, and `$tuturuuu-commit`.
Read root/database `AGENTS.md` and the CI/tooling and database references. Obtain
the root-manifest transfers, create an isolated worktree from `132a9e3ebb`, and
run `bun setup`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused script | `node --test scripts/supabase-command-contract.test.js` | apply/typegen mutation contract passes |
| Script discovery | `bun test:scripts --list | rg 'scripts/supabase-command-contract.test.js'` | new suite is root-discovered |
| Script suite | `bun test:scripts` | all script tests pass |
| Plugin | `python3 plugins/tuturuuu/scripts/validate_plugin.py` | plugin and skill references validate |
| JSON | `python3 -m json.tool package.json` | valid JSON |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** root `sb:up` alias; one root-discovered script contract test;
database workflow docs, `apps/docs/build/development-tools/codex-plugin.mdx`,
and the focused Tuturuuu database reference if they currently imply automatic
generation.

**Out of scope:** changing `sb:reset`, `sb:diff`, remote `sbr:*`, push/pull
semantics, generated types, migrations, dependencies/lockfile, or invoking a
live database in the unit test.

## Git workflow

After transfer use `chore/supabase-up-apply-only` and commit
`chore(database): separate migration apply and typegen`. Claim/release the
commit window; do not push.

## Steps

1. Add a root-discovered source-contract test that parses both manifests and
   proves local root `sb:up` delegates only to the database workspace's
   apply-only alias, while `sb:typegen` remains the sole explicit local type
   generator. Keep remote and reset/diff behavior characterized, not changed.
2. Change only root `sb:up` to `cd apps/database && bun sb:up`. Do not manually
   alter any dependency or generated file.
3. Search workflows/docs/scripts for callers that relied on implicit typegen.
   Update an intentional schema-changing workflow to run `bun sb:typegen`
   explicitly; STOP if a production or third-party caller cannot be mapped.
4. Update the database workflow/reference to say: apply with `bun sb:up`, then
   run `bun sb:typegen` only when the migration changes generated schema types.
5. Run focused discovery, full script, repository, JSON, and whitespace gates.

## Done criteria

- [ ] `bun sb:up` applies local migrations without invoking typegen.
- [ ] `bun sb:typegen` remains explicit and documented for schema changes.
- [ ] Every in-repo caller that required implicit generation is updated.
- [ ] The contract test is enrolled in the canonical script suite.
- [ ] No migration, generated type, manifest dependency, or lockfile drift.

## STOP conditions

Stop on ownership, an unmapped external/production dependency on implicit
typegen, need to change remote/reset/diff semantics, generated-type or lockfile
drift, or any gate failing twice.
