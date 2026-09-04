# Plan 278: Preserve the Lockfile During Routine Cleanup

> **Executor instructions:** Make the supported root cleanup remove only
> regenerable dependency and build directories. Preserve the tracked Bun
> lockfile by default, keep lockfile deletion behind an explicit exceptional
> command, and never combine cleanup with automatic dependency resolution.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- package.json scripts/clean-repository.js scripts/clean-repository.test.js scripts/run-script-tests.js apps/docs/build/development-tools/cleaning-clone.mdx apps/docs/build/development-tools/development.mdx tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — obtain the Forms handoff's exact root
  `package.json` transfer
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** DX / reproducible dependency cleanup
- **Depends on:** Plan 004's automatic script-test discovery; Forms root-package
  ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The command documented as routine cleanup currently deletes the tracked
`bun.lock` and then tells contributors to run an unfrozen install. Clearing a
cache can therefore become an unreviewed dependency-resolution change, dirty a
shared checkout, and compound the workspace metadata drift addressed separately
by Plan 003. Routine cleanup must preserve the committed dependency graph.

## Current state and exact contract

- `package.json:32` defines `clean` as `rm -rf bun.lock`, cache-directory
  deletion, and `npkill --delete-all`.
- `apps/docs/build/development-tools/cleaning-clone.mdx:20-49` recommends that
  command, explicitly instructs deleting `bun.lock`, and follows it with
  unfrozen `bun i`.
- `apps/docs/build/development-tools/development.mdx:394-403` correctly prefers
  the narrower Web cache cleaner for dev-server problems and warns against
  disturbing unrelated app output. Preserve that safety guidance.
- Replace the opaque shell pipeline with `scripts/clean-repository.js`, modeled
  on the dry-run, path-validation, and injectable-helper style in
  `scripts/clean-web-dev-cache.js`.
- `bun clean` must remove `node_modules`, `.next`, and `.turbo` directories in
  the current checkout while preserving `bun.lock`, source, generated source,
  local databases, `.git`, nested `.worktrees`, and coordination state. It must
  not follow symlinks or escape the repository root.
- Support `bun clean -- --dry-run`; it prints the deterministic candidate list
  and removes nothing. The normal command applies exactly that list.
- Add `bun clean:lockfile` as the exceptional opt-in. It must require the
  explicit CLI acknowledgement
  `--yes-i-understand-dependency-resolution-will-change`, delete only the root
  `bun.lock` in addition to the normal cleanup targets, and never run `bun
  install`, `bun update`, or another resolver automatically. Invocation without
  the acknowledgement exits nonzero without deleting anything.
- Do not use `npkill` or download a cleanup dependency. The repository-owned
  helper must implement and test the bounded traversal itself.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read the root AGENTS,
the two cleanup guides, Plan 003, Plan 004, Plan 219, and the active Forms
handoff. Obtain exact root-manifest transfer before editing. Do not run either
destructive cleanup mode in the shared checkout during implementation or tests;
tests must use disposable temporary fixtures.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused contract | `node --test scripts/clean-repository.test.js` | preservation, traversal, dry-run, apply, and opt-in reset fixtures pass |
| Discovery | `node scripts/run-script-tests.js --list | rg '^scripts/clean-repository\.test\.js$'` | exactly one matching discovered test path |
| Full scripts | `bun test:scripts` | Plan 004's discovered script suite passes |
| Manifest | `node -e "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8'))"` | exit 0 |
| Repository | `bun check && git diff --check` | canonical checks pass; whitespace output is empty |

## Scope

**In scope:** root `package.json`; new `scripts/clean-repository.js` and its
discovered test; only the routine-cleanup sections of
`apps/docs/build/development-tools/cleaning-clone.mdx` and, if its existing
warning needs wording alignment,
`apps/docs/build/development-tools/development.mdx`.

**Out of scope:** dependency or version changes; edits to `bun.lock`; running a
real cleanup or install; changing Plan 003's release invariant, Plan 219's
worktree setup, Web's targeted dev-cache implementation, package-manager
configuration, CI workflows, or unrelated documentation.

## Steps

1. Add red fixture tests for a repository tree containing root/nested
   `node_modules`, `.next`, and `.turbo` directories; a tracked `bun.lock`;
   ordinary source; a symlink; and a nested `.worktrees` checkout. Prove dry-run
   is deterministic and inert, default apply removes only the three regenerable
   directory names, and every protected path survives.
2. Add refusal tests for missing/wrong lock-reset acknowledgement. Prove the
   exact acknowledged mode removes only the root lockfile plus normal cleanup
   targets and never invokes a package manager or network command.
3. Implement the repository-owned helper with pure candidate discovery and an
   injected filesystem boundary. Resolve and validate every deletion target
   beneath the repository root, prune protected directory trees before
   traversal, ignore symlinks, and perform deletion only after the complete
   candidate set validates.
4. Point `clean` at the safe default helper and add the explicitly acknowledged
   `clean:lockfile` command. Do not add, remove, or update dependencies. Confirm
   Plan 004's runner discovers the new test without adding another manual test
   list.
5. Rewrite the cleanup guide so routine recovery preserves `bun.lock` and uses
   the pinned Bun version. Document the exceptional reset as a dependency-
   resolution operation requiring explicit review, not as cache cleanup; remove
   the generic `bun upgrade` advice. Keep the narrower Web cleanup guidance.
6. Run focused/discovery/full script tests, manifest parsing, `bun check`,
   whitespace, and exact-scope review.

## Done criteria

- [ ] `bun clean` preserves `bun.lock` and removes only bounded regenerable
      dependency/build directories in the current checkout.
- [ ] Dry-run is inert and nested worktrees, symlinks, source, databases, and
      coordination state are protected by tests.
- [ ] Lockfile deletion requires the exact explicit opt-in and never triggers
      automatic dependency resolution.
- [ ] Maintained docs no longer recommend deleting the lockfile for routine
      cleanup or upgrading away from the pinned Bun version.
- [ ] The new test is discovered automatically; focused/full script,
      repository, manifest, and whitespace gates pass without dependency or
      lockfile changes.

## STOP conditions

Stop on missing Forms transfer; absent Plan 004 discovery runner; evidence that
a maintained automation caller intentionally relies on `bun clean` deleting
the lockfile; any need to traverse nested worktrees or delete local databases;
any package-manager invocation from the cleanup helper; dependency/lockfile
drift; or any mandatory gate failing twice.

## Maintenance notes

Treat lockfiles as reviewed source, not cache. New cleanup targets must be
regenerable directories, protected by path-boundary and symlink fixtures, and
added to the dry-run output before deletion support lands.
