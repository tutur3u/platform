# Plan 219: Make Worktree Setup Lockfile-Preserving by Default

> **Executor instructions:** Make the mandatory first command in a new worktree
> fail closed on manifest/lockfile mismatch instead of silently rewriting
> `bun.lock`. Preserve an explicit opt-in command for intentional lock refresh.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- package.json scripts plugins/tuturuuu/skills/tuturuuu-platform plugins/tuturuuu/skills/tuturuuu-agent-coordination apps/docs/build/development-tools bun.lock tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — root manifest and lockfile ownership must be
  transferred from the Forms and Mail handoffs
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** developer experience / worktrees / dependency safety
- **Depends on:** none
- **Planned at:** commit `52f4aa1b12`, 2026-08-11

## Why this matters

Root policy requires `bun setup` immediately in every isolated worktree, but
the command begins with mutable `bun i`. Executors repeatedly have to identify
and restore setup-only lockfile churn before touching source; Plan 215 still
retains exactly that out-of-scope drift. The safe default should validate the
reviewed lockfile and stop, while intentional dependency reconciliation remains
an explicit separate workflow.

## Current state and exact contract

- `package.json` defines `setup` as `bun i && ...`.
- Preserve the Portless setup and five explicit prerequisite Turbo build
  filters exactly (`@tuturuuu/types`, `@tuturuuu/supabase`,
  `@tuturuuu/masonry`, `@tuturuuu/internal-api`, and `tuturuuu`).
- Change only the install phase to Bun's frozen-lockfile mode. If manifests and
  `bun.lock` disagree, setup must exit nonzero without modifying the lockfile.
- Add a clearly named opt-in command, `setup:update-lockfile`, that retains the
  current mutable install followed by the same setup/build phases. It is for
  deliberate dependency/manifest reconciliation, not normal worktree startup.
- Update the narrow platform/coordination reference and development-tooling docs
  that describe worktree setup; do not add another root hard mandate.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, `$tuturuuu-ci-docs`, `$tuturuuu-commit`, and
`$using-git-worktrees`. Read root AGENTS and the focused references. Do not
start until the Forms handoff transfers `package.json` and the Mail handoff
transfers `bun.lock`. Create an exact-base isolated worktree and, for this plan
only, run the existing `bun setup` once before editing as policy requires;
restore its setup-only lock drift.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused scripts | `node --test scripts/setup-worktree.test.js` | frozen success, mismatch failure/no-write, and opt-in mutation fixtures pass |
| Plugin | `python3 plugins/tuturuuu/scripts/validate_plugin.py` | exit 0 |
| Script discovery | `bun test:scripts` | all script tests, including the new file, pass |
| JSON | `python3 -m json.tool package.json >/dev/null` | exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** root setup scripts plus focused `test:scripts` registration in
`package.json`; a new pure fixture-driven `scripts/setup-worktree.test.js`; the narrow platform/coordination skill
references and one existing development-tooling docs page that documents setup.
`bun.lock` is read-only proof and must have zero final diff. **Out of scope:**
dependency/version changes, Bun upgrades, Portless behavior, prerequisite build
selection, AGENTS policy, CI install commands, or cleaning existing worktrees.

## Steps

1. Add a fixture-driven script contract test that copies minimal manifests and
   lockfile to a temporary directory, injects a fake Bun executable, and proves
   default setup selects frozen mode, propagates failure, and never writes the
   lockfile; prove the opt-in command selects mutable mode. Register this exact
   file in the current root `test:scripts` command so `bun check` cannot miss
   it. Do not run real package installation inside the test.
2. Change `setup` to the frozen install and add `setup:update-lockfile` with the
   old mutable behavior. Factor a small root script only if shell duplication
   makes the contract untestable; include it explicitly in scope/tests.
3. Update the focused skill references/docs to explain the fail-closed default
   and when the opt-in command is authorized. Run plugin, script, JSON,
   repository, whitespace, zero-lock-diff, and scope gates.

## Done criteria

- [ ] Normal `bun setup` cannot modify `bun.lock` and fails on mismatch.
- [ ] The opt-in command is explicit and preserves the existing full setup.
- [ ] Portless and prerequisite Turbo build behavior are unchanged.
- [ ] Focused/script/plugin/JSON/repository gates pass and `bun.lock` has zero
      final diff.

## STOP conditions

Stop on unresolved root/lock ownership, evidence that supported worktrees rely
on implicit lock repair, need to change dependencies/Bun/CI, plugin-doc drift,
or any mandatory gate failing twice.
