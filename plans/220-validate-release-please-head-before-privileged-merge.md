# Plan 220: Validate the Release Please Head Before Privileged Merge

> **Executor instructions:** Make the scheduled/manual release merge fail closed
> unless the selected remote ref is the exact validated head of the expected
> open Release Please pull request. Reuse one generated-output trust policy for
> approval and merge; do not invent a second allowlist.
>
> **Drift check (run first):**
> `git diff --stat 968bd12018..HEAD -- .github/workflows/release-please-auto-merge.yaml .github/workflows/release-please.yaml scripts/git-release-please.js scripts/git-release-please.test.js scripts/ci/release-please-auto-approve-core.js scripts/ci/release-please-auto-approve.js scripts/ci/release-please-auto-approve.test.js scripts/ci/release-please-auto-merge.test.js scripts/ci/release-workflows.test.js tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — active release auto-merge handoff owns the
  workflow and focused test; stale top-level done note also needs archival
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** security / CI / release supply chain
- **Depends on:** explicit transfer from the active release auto-merge handoff
- **Planned at:** commit `968bd12018`, 2026-08-11

## Why this matters

The release workflow uses an organization-admin credential to push directly to
protected `main` and `production`, but selects merge input by a writable branch
prefix. A collaborator who can create or update a matching branch can therefore
route arbitrary passing code around the pull-request review, code-owner, and
thread-resolution controls unless merge time revalidates the exact PR identity
and content.

## Current state and exact contract

- `.github/workflows/release-please-auto-merge.yaml:63-99` prefers
  `release-please--branches--production`, otherwise the newest matching prefix,
  and checks only ancestry. Lines 124-138 require the organization-admin token;
  lines 189-195 merge and synchronize protected branches.
- `scripts/git-release-please.js:142-165,274-292` repeats prefix-only selection;
  `mergeReleaseBranch`/`finalizeMerge` stage and validate the resulting tree but
  never prove which PR/ref supplied it.
- `scripts/ci/release-please-auto-approve-core.js` and
  `release-please-auto-approve.js:195-220` already own the canonical generated
  file/author policy. Extract or export reusable pure validation instead of
  copying its allowed paths.
- Before any merge, resolve exactly one open PR whose base is `production` and
  whose head ref equals the selected release branch. Require the PR head SHA to
  equal the freshly fetched remote SHA. Validate every paginated commit and
  changed file against the canonical Release Please author/path policy and
  require the expected approved/check state.
- Add explicit read permissions for pull requests and checks. Re-fetch and
  repeat the head-SHA/PR-state validation before the immutable SHA is merged,
  then repeat the remote-head, open-PR, current-head approval, and required-check
  validation immediately before `bun git-sync` pushes. Fail closed on
  no/multiple PRs, stale SHA, pagination truncation, unexpected author/path,
  missing approval, or non-success required checks. Never print credentials or
  raw authorization headers.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-development-tooling`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root AGENTS and the
release workflow tests. Do not start until
`tmp/agent-coordination/20260725-162800-claude-release-auto-merge-fix.md`
transfers the exact paths and the stale top-level done note for the same workflow
is archived or explicitly dispositioned.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused security contracts | `node --test scripts/ci/release-please-auto-approve.test.js scripts/ci/release-please-auto-merge.test.js scripts/git-release-please.test.js` | exact-PR/head/content/state positives pass; every named fail-closed case passes |
| Workflow contracts | `node --test scripts/ci/release-workflows.test.js scripts/ci/check-workflow-config.test.js` | workflow remains valid and privileged merge cannot run before validation |
| YAML parse | `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release-please-auto-merge.yaml", aliases: true)'` | exit 0 |
| Plugin | `python3 plugins/tuturuuu/scripts/validate_plugin.py` | exit 0 if the CI tooling reference changes |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** the release auto-merge workflow; `scripts/git-release-please.js`
and its test; the existing approve core/CLI/tests only as needed to expose one
pure canonical validator; existing release workflow contract tests; the focused
CI tooling reference if the operator contract changes.

**Out of scope:** changing generated Release Please output, release versions,
tokens/secrets/rulesets, weakening protected branches, changing ordinary
`bun git-sync`, merging a live release, or broad workflow refactors.

## Steps

1. Add red pure tests for no PR, multiple PRs, wrong base/head, stale remote SHA,
   unexpected author/path, truncated pagination, missing approval, failed or
   pending required checks, and a valid generated-only PR. **Verify:** focused
   tests fail only because merge-time validation is absent.
2. Refactor the canonical generated-output author/path evaluator into a reusable
   pure seam without changing approval behavior. Add exact PR/head/state
   validation and fully paginated GitHub API readers. **Verify:** approve tests
   and new validator tests pass.
3. Make the workflow validate after fetch and pass the immutable validated SHA
   into `git-release-please.js`; remove its newest-prefix fallback for
   privileged workflow use. After its long repository/mobile checks and merge
   commit, re-query the PR and remote ref immediately before `bun git-sync` and
   require that the PR remains open, its head is still the immutable SHA, its
   approval is for that SHA, and required checks remain successful. **Verify:**
   workflow tests prove both merge and sync depend on their adjacent validation
   gates, including a state/head change during the long check interval.
4. Run workflow, repository, whitespace, secret-safety, and exact-scope review.

## Done criteria

- [ ] A matching branch name alone can never reach the privileged merge/push.
- [ ] The exact open PR, base/head ref, fetched SHA, authors, files, approval,
      and required checks are validated before merge and again immediately
      before push, with full pagination and an immutable merge SHA.
- [ ] Approval and merge use one canonical generated-output policy.
- [ ] Focused/workflow/repository/whitespace gates pass with no credential data
      in source, fixtures, logs, or diffs.

## STOP conditions

Stop on unresolved ownership, inability to identify exactly one expected PR,
GitHub API pagination/state semantics not representable in deterministic tests,
need to weaken rulesets or expose a credential, unexpected release-output
policy drift, or any mandatory gate failing twice.
