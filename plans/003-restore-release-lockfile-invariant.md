# Plan 003: Restore the Release Lockfile Invariant

> **Executor instructions:** Follow every step and gate. Re-count drift before
> editing; if it is zero, retain prevention work but do not manufacture a
> lockfile diff. Stop and report on STOP conditions, then update the index row.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- bun.lock apps/'*'/package.json packages/'*'/package.json scripts/git-release-please.js scripts/git-release-please.test.js .github/workflows/release-please-auto-merge.yaml`
> Reconcile any release-helper or lockfile change before proceeding.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** Release Engineering / CI
- **Depends on:** Mail lockfile and release-lifecycle ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while the Mail handoff owns `bun.lock` and active release
lanes own adjacent Release Please workflow/helper surfaces. The live shared
checkout also contains unrelated lockfile version drift; preserve it until
ownership and provenance are explicitly transferred.

## Why this matters

At the audited commit, 21 workspace `package.json` versions are newer than their
workspace records in `bun.lock`. Frozen installs can fail or consume stale
workspace metadata. Release Please CI installs the pre-merge lockfile, while the
merge helper subsequently changes versions without refreshing it, so the gate
cannot detect drift introduced by the merge it is about to commit.

## Current state

- Example: `apps/ai/package.json` is `0.8.1`; the `apps/ai` workspace record in
  `bun.lock` is `0.8.0`.
- A fresh read-only comparison at `60e33aebd9` still found 21 mismatches across satellite apps plus
  `packages/satellite`, `packages/ui`, and `packages/utils`.
- `scripts/git-release-please.js::finalizeMerge` synchronizes the platform
  version, optionally formats, stages everything, runs release checks, and
  commits; it does not refresh or assert `bun.lock`.
- `.github/workflows/release-please-auto-merge.yaml` runs
  `bun install --frozen-lockfile` before invoking the merge helper, so it checks
  the base checkout rather than the post-merge manifests.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit` if committing. Work in an
isolated branch/worktree and claim the commit window only for index/commit work.

```bash
git status --short
git rev-parse HEAD
```

## Scope

In scope: repair workspace metadata in `bun.lock`; harden the Release Please
merge helper and its tests; document the invariant if workflow behavior changes.

Out of scope: manual package version bumps, dependency upgrades, changing
Release Please ownership, or merging a release PR.

## Git workflow

- Branch: `fix/release-lockfile-invariant` in an isolated worktree.
- Conventional Commit: `fix(release): keep workspace lock metadata current`.
- Do not execute an actual release merge, push, or open a PR unless instructed.
  Claim the commit window before staging/committing.

## Steps

1. **Add a deterministic mismatch check.** Implement
   `scripts/check-workspace-lockfile-versions.js` and its colocated test. The
   helper must parse
   Bun's lockfile format and compares every workspace manifest name/version with
   its lock workspace record. It must report paths and expected/actual versions,
   work with scoped package names, and ignore workspaces without versions by
   explicit policy.

2. **Prove the current failure.** Run the helper against the audited state and
   capture the mismatch count in the PR description without dumping the whole
   lockfile. Add a fixture test that fails on one stale workspace record.

3. **Refresh with Bun, not manual edits.** Run the owning package-manager command
   (prefer `bun install --lockfile-only`) and inspect `git diff -- bun.lock`.
   The diff should update workspace metadata only; stop if unrelated resolved
   dependency versions or integrity entries change unexpectedly.

4. **Harden release finalization.** In `finalizeMerge`, refresh the lockfile after
   merging/synchronizing release-owned versions and before staging/release
   checks. Then run the deterministic invariant check. Keep command injection in
   tests so no unit test performs a real install or commit.

5. **Test command order and failure behavior.** Extend
   `scripts/git-release-please.test.js` to prove lock refresh occurs before
   `git add --all`, validation, and commit; a refresh/check failure aborts without
   committing; resume behavior remains safe; and format/no-format paths agree.

6. **Align CI/docs.** Keep the initial frozen install for reproducible tooling,
   but document that the merge helper refreshes and validates post-merge
   workspace metadata. If a standalone CI check is added, use the same helper
   rather than a duplicate parser.

7. **Verify without broadening the diff.** Run focused script tests, the
   workspace invariant, `bun install --frozen-lockfile` after refresh, then
   `bun check`. Do not run an actual release merge in the shared checkout.

## Commands you will need

```bash
node --test scripts/git-release-please.test.js \
  scripts/check-workspace-lockfile-versions.test.js
node scripts/check-workspace-lockfile-versions.js
bun install --frozen-lockfile
bun check
git diff --check
git diff -- bun.lock scripts/git-release-please.js scripts/git-release-please.test.js
```

## Test plan

Create `scripts/check-workspace-lockfile-versions.test.js`; extend
`scripts/git-release-please.test.js`. Cover clean/stale/missing workspace records,
scoped names, versionless workspaces, refresh ordering, refresh failure,
invariant failure, resume behavior, and both format modes. Mock all child
commands in unit tests.

## Done criteria

- [ ] Every versioned workspace manifest agrees with its `bun.lock` workspace
  record.
- [ ] Release finalization refreshes and checks the post-merge lockfile before
  committing.
- [ ] Unit tests prove ordering, abort behavior, and mismatch diagnostics.
- [ ] The diff contains no manual version bump or unrelated dependency update.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if Bun's lock-only refresh changes external dependency resolution, if the
release branch contains non-release dependency edits, or if the helper cannot
parse the repository's lockfile without relying on an unstable ad-hoc parser.

## Maintenance notes

Reviewers should verify that Bun refresh happens after all release-owned
manifest edits and before staging, while CI still starts from a frozen base
install. If lockfile syntax changes, update one shared parser and its fixtures.
