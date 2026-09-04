# Plan 075: Put Masonry on the Governed Package-Release Pipeline

> **Executor instructions:** Add Masonry to the existing trusted-publication
> pipeline and replace manual version/publish instructions. Copy the current
> governed workflow contract exactly; never publish or bump a version while
> implementing this plan.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/masonry/package.json packages/masonry/PUBLISHING.md packages/masonry/README.md apps/docs/reference/packages/masonry.mdx .github/workflows tuturuuu.ts scripts/ci/release-workflows.test.js scripts/ci/ci-cache-policy.test.js scripts/ci/package-release-readiness.test.js scripts/ci/package-release-readiness.js`
> Stop on release-governance or CI ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** DX / release automation / docs
- **Depends on:** Plan 074; non-Vercel JS CI/cache ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Release Please already versions public `@tuturuuu/masonry`, but no workflow
publishes it. Its runbook instead instructs manual version edits and
`npm publish`, and public docs name an older release. Repository, npm, and docs
can diverge while operators bypass trusted-publisher gates.

## Current state

- `release-please-config.json:230-233` and
  `.release-please-manifest.json:53` govern Masonry at 0.5.0.
- There are governed release workflows for fourteen other public packages but
  no `release-masonry-package.yaml`.
- `packages/masonry/PUBLISHING.md:10-48` prescribes manual version mutation,
  login, and publish.
- `apps/docs/reference/packages/masonry.mdx:9` calls 0.4.3 current.
- The active non-Vercel CI/cache lane owns
  `scripts/ci/release-workflows.test.js`; remain blocked until release/transfer.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-platform`, and `$tuturuuu-agent-coordination`. Confirm Plan 074 is
done and the CI validator owner released the exact path. Use
`.github/workflows/release-ui-package.yaml` as the primary current exemplar and
compare at least one dependency-light package workflow.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Release tests | `node --test scripts/ci/release-workflows.test.js scripts/ci/package-release-readiness.test.js scripts/ci/prepare-npm-package-manifest.test.js` | Masonry cases pass |
| CI cache test | `node --test scripts/ci/ci-cache-policy.test.js` | package workflow count/policy pass |
| Package tests/build | `bun run --cwd packages/masonry test && bun run --cwd packages/masonry build` | exit 0 |
| Stale docs check | `rg -n -e '0\.3\.10 \(Stable\)' -e 'zero external dependencies' -e 'current release \(0\.4\.3\)' packages/masonry/README.md apps/docs/reference/packages/masonry.mdx` | no output |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `.github/workflows/release-masonry-package.yaml` (create)
- `tuturuuu.ts`
- `scripts/ci/release-workflows.test.js`
- `scripts/ci/ci-cache-policy.test.js`
- `scripts/ci/package-release-readiness.test.js` only if registration coverage requires it
- `packages/masonry/PUBLISHING.md`
- `packages/masonry/README.md`
- `apps/docs/reference/packages/masonry.mdx`
- `plans/README.md` only for status

Do not edit package/release-manifest versions, changelog, credentials, npm
settings, unrelated workflows, or publish anything.

## Git workflow

Use isolated branch `chore/govern-masonry-releases`, run `bun setup`, and commit
`ci(masonry): govern package releases`. Claim the commit window; do not push or
open a PR unless instructed.

## Steps

### Step 1: Characterize the governed workflow contract

Extend the release validator first. Require a production-only workflow,
`ci-check.yml` gate, package-release readiness gate for `packages/masonry`,
workspace tests/build, manifest preparation, artifact upload/download, a
minimal OIDC-only publish job, exact-version npm verification, and dependent
workflow dispatch behavior matching current package conventions.
Register the workflow in the root `tuturuuu.ts` CI registry and update the
cache-policy test's expected package-workflow count from 14 to 15.

### Step 2: Add the Masonry release workflow

Create `release-masonry-package.yaml` by adapting the current UI/package
exemplar. Use environment name `masonry-release-production`, artifact name
`tuturuuu-masonry-npm-package`, package path `packages/masonry`, and production
trusted publishing. Do not add token-based fallback or install/execute package
scripts in the OIDC publish job.

### Step 3: Replace manual release guidance

Rewrite `PUBLISHING.md` around Release Please, production promotion, trusted
publication, exact-version verification, and recovery diagnostics. Remove
manual version edits/login/publish instructions. In both README/docs, avoid a
hard-coded “current version”; point to the package manifest/changelog/npm for
live version truth and keep component API guidance intact.

### Step 4: Run release, package, docs, and repository gates

Run all listed commands. Inspect the diff for secret names only—never values—and
confirm no version/changelog/manifest changes occurred.

## Test plan

Validator coverage must fail if Masonry loses production-only gating, readiness
checks, artifact isolation, OIDC permission, exact-version verification, or
uses a token publish fallback. Existing package tests/build remain green.

## Done criteria

- [ ] Masonry has one governed trusted-publishing workflow matching current policy.
- [ ] Release validators explicitly cover it.
- [ ] Manual version/login/publish instructions and stale current-version claims are gone.
- [ ] No package version, release manifest, changelog, credential, or npm state changed.
- [ ] Release/cache tests, package tests/build, stale-docs check, `bun check`, and whitespace pass.

## STOP conditions

Stop if Plan 074 or CI ownership remains incomplete, npm trusted-publisher or
environment identity is not already provisioned/confirmable by the operator,
the current workflow pattern differs materially from the named exemplar, a
version bump appears necessary, or a gate fails twice.

## Maintenance notes

Masonry releases should be ordinary Release Please output consumed by the same
artifact-separated OIDC pipeline as other public packages. Documentation must
not duplicate mutable version truth.
