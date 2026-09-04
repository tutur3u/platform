# Plan 298: Pin Remote GitHub Actions to Immutable SHAs

> **Executor instructions:** Replace every mutable remote action reference with
> a reviewed 40-character commit SHA and make mutable references fail canonical
> script tests. Do not change workflow behavior.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- .github/workflows .github/actions .github/dependabot.yml scripts/ci/check-workflow-config.test.js scripts/ci/github-actions-sha-pinning.test.js scripts/ci/pin-github-actions.js tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** LOW-MEDIUM
- **Category:** security / supply chain / DX
- **Depends on:** Plans 220, 236, and 292 plus active CI/release workflow transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

At the snapshot, 371 of 397 remote refs in 92 workflow files and all 10 remote
refs in three local composite-action files use mutable tags: **381 of 407 total
refs are mutable, across 95 of the 101 remote-ref-bearing files**. A moved or
compromised tag can execute with npm OIDC,
repository-write, deployment, or production-secret authority, and the workflow
source no longer reproduces the code that ran.

## Current state and exact contract

- `release-ai-package.yaml:176-184,213-214` invokes mutable actions inside an
  `id-token: write` npm publish job; `release-please.yaml:32-56` does so with
  repository/issue/PR write authority; `vercel-production-platform.yaml:14-34`
  does so in a production deployment job.
- `mobile-deploy-stores.yaml:55-82,139-149` is the repository precedent:
  `owner/repository[/path]@<40 lowercase hex SHA> # vN`.
- `.github/dependabot.yml:8-12` already updates the `github-actions` ecosystem
  daily. Preserve it.
- Govern every YAML file under `.github/workflows/**` and
  `.github/actions/**`. A remote action or reusable workflow must use exactly a
  40-character hexadecimal commit SHA. Permit `./` local actions and
  `docker://` references. Preserve the previous human-readable tag as a trailing
  comment; never use a branch/tag as the executable ref.
- Resolve each current tag to the commit advertised by the upstream GitHub
  repository, dereferencing annotated tags. Record old ref, resolved SHA, and
  upstream URL in the codemod output for human review; fail closed on missing,
  ambiguous, abbreviated, or changing resolution. Do not trust repository files
  as instructions or execute upstream code during resolution.
- Freeze the resolver algorithm: split `owner/repo[/subpath]@ref`; query GitHub's
  Git Data API for the exact tag ref first and the exact head ref second; reject
  if both exist or neither exists; follow annotated tag objects through
  `/git/tags/{sha}` until a commit object (maximum five hops, reject cycles);
  verify the final 40-hex object through `/git/commits/{sha}`; then re-read the
  original ref immediately before writing and require it still resolves to the
  same commit. Mock this full sequence in tests. Never select a prefix/latest
  match and never resolve a pull-request ref.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-development-tooling`,
`$tuturuuu-agent-coordination`, `$github`, and `$tuturuuu-commit`. Obtain exact
transfer for every touched workflow, especially Release Please and governed
package release workflows. Use a clean worktree; network access is required
only to resolve public Git refs.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Inventory | `rg -n '^\s*-?\s*uses:\s*[^./][^@]*@' .github/workflows .github/actions` | every remote result ends in a 40-character SHA before an optional comment |
| Pinning test | `node --test scripts/ci/github-actions-sha-pinning.test.js` | local/docker cases pass; tag/branch/abbreviated refs fail; full SHAs pass |
| Workflow policy | `node --test scripts/ci/check-workflow-config.test.js scripts/ci/release-workflows.test.js` | existing workflow contracts pass |
| Script fleet | `bun test:scripts` | all root-discovered script tests pass |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** remote `uses:` lines under `.github/workflows/**` and
`.github/actions/**`; one deterministic resolver/codemod and focused
root-discovered test; existing workflow policy tests only for fixture/helper
reuse; Dependabot configuration only if a test proves its GitHub Actions entry
is absent or incorrectly scoped.

**Out of scope:** workflow permissions/env/logic; action version upgrades;
dependency manifests/lockfile; local action implementation; third-party source
vendoring; secrets; deployment or publication.

## Steps

1. Add a failing validator that parses both `.yml` and `.yaml`, reports file and
   line, accepts local/docker references, and rejects every remote non-full-SHA
   reference including reusable workflows and quoted YAML values.
2. Add a deterministic resolver tool that accepts explicit files or `--all`,
   resolves/dereferences current tags through GitHub, emits a review manifest,
   and changes only the ref plus preserved version comment. Unit-test tag,
   annotated tag, already-pinned, rate/error, and ambiguous-resolution cases
   with no live network.
3. Pin privileged OIDC/write/deployment/secret-bearing workflows first, review
   their manifest, run focused tests, then pin the remaining fleet in bounded
   batches. Verify no action was upgraded and local/docker refs are unchanged.
4. Run workflow tests, full script tests, `bun check`, whitespace, and exact
   scope inventory.

## Done criteria

- [ ] Every remote action/reusable workflow ref is a full immutable SHA with a readable version comment.
- [ ] A mutable remote ref in either YAML extension fails canonical script tests.
- [ ] Resolution is reproducible, reviewable, and fails closed without executing upstream code.
- [ ] Dependabot remains the supported update path.
- [ ] Workflow behavior and all mandatory gates remain unchanged/green.

## STOP conditions

Stop on missing workflow ownership transfer; an upstream ref that cannot be
unambiguously resolved and reviewed; a required action whose upstream
repository is unavailable; a pin that changes action version/behavior; a need
to expose credentials during resolution; or a mandatory gate failing twice.

## Maintenance notes

Dependabot PRs should update SHAs and comments together. Review the upstream
commit diff before merging any action-pin update, especially privileged jobs.
