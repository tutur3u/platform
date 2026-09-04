# Plan 292: Remove Production Credentials from Package Release Builds

> **Executor instructions:** Make governed package build jobs credential-free.
> Remove production service secrets from job scope before dependency install,
> and reject their return with one fleet-level workflow contract test.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- '.github/workflows/release-ai-package.yaml' '.github/workflows/release-supabase-package.yaml' '.github/workflows/release-types-package.yaml' '.github/workflows/release-typescript-config-package.yaml' '.github/workflows/release-ui-package.yaml' scripts/ci/release-workflows.test.js tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the Forms handoff and Plan 236 own the shared
  release-workflow contract test
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW-MEDIUM
- **Category:** CI security / release engineering
- **Depends on:** Plan 236 path transfer and Forms release-test transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Five public-package `build` jobs expose production Supabase and proxy credential
types to the whole job. Each job installs dependencies before running
checkout-controlled build, test, or metadata commands. Root Bun configuration
permits lifecycle execution for fourteen trusted dependencies, so credentials
are ambient during both dependency scripts and repository code even though the
release builds do not need live production access.

## Current state and exact contract

- `.github/workflows/release-{ai,supabase,types,typescript-config,ui}-package.yaml`
  each defines the same five production service variables at `jobs.build.env`:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`, `PROXY_API_KEY`, and `NEXT_PUBLIC_PROXY_API_KEY`.
  Do not inspect or reproduce any value.
- The variables are in scope for `bun install` and every later build/test step.
  The TypeScript-config job only validates package metadata; it nevertheless
  receives the same credentials.
- `release-icons-package.yaml` is the credential-free precedent. The UI and
  Supabase unit suites already inject inert test configuration in their own
  test seams. Remove the five job-level variables from all five workflows.
- Do not replace production secrets with repository/environment secrets under
  different names. If an exact focused test proves configuration is required,
  supply a literal inert non-secret value only on that individual test step,
  after dependency installation. STOP if any test attempts a live service.
- Extend `scripts/ci/release-workflows.test.js` to enumerate all governed
  package-release workflows and fail when a `build` job references any
  production Supabase secret, Supabase secret-key variable, proxy credential,
  or equivalent repository/environment secret expression. The invariant must
  allow OIDC/npm publication credentials only in the existing publish job and
  must not reject Turbo cache token/team inputs already scoped to the cache
  action.
- Preserve release gates, branch conditions, permissions, install commands,
  Turbo cache wiring, package commands, artifacts, OIDC publication, and every
  non-build job unchanged.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-development-tooling`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain exact transfer of
`scripts/ci/release-workflows.test.js` from the Forms handoff and Plan 236.
Review current GitHub secret names only as identifiers; never read their values.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused workflow contract | `node --test scripts/ci/release-workflows.test.js` | every package build job is credential-free and publication-only credentials remain accepted |
| Secret-reference absence | `if rg -n 'NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|SUPABASE_SECRET_KEY|PROXY_API_KEY|NEXT_PUBLIC_PROXY_API_KEY' .github/workflows/release-{ai,supabase,types,typescript-config,ui}-package.yaml; then exit 1; fi` | no production service credential reference remains in the five workflows |
| Script discovery | `node scripts/run-script-tests.js --list | rg '^scripts/ci/release-workflows\.test\.js$' && bun run test:scripts` | the workflow contract remains canonical and the script suite passes |
| Repository | `bun check && git diff --check` | repository and whitespace gates pass |
| Scope | `git status --short` | only the five workflows and shared workflow test changed |

## Scope

**In scope:** the five exact package-release workflow files and the existing
release-workflow contract test.

**Out of scope:** package source/manifests; dependency versions; lockfiles;
release readiness or tarball smoke behavior; publish-job OIDC permissions;
Turbo cache credentials; secret rotation; live publishing; unrelated workflow
normalization.

## Steps

1. Add a red contract fixture proving both job-level and build-step production
   service secret references fail for a package `build` job, while the existing
   publication and Turbo-cache credential boundaries remain accepted.
2. Remove the five-variable `build.env` block from each named workflow. Run the
   focused contract. If an exact suite now lacks configuration, add only inert,
   step-scoped test values after install and add a negative assertion that no
   `${{ secrets.* }}` or `${{ vars.* }}` live-service expression is used there.
3. Run focused workflow, discovery, full script, repository, whitespace, and
   exact-scope gates. Inspect the YAML diff for accidental branch, permission,
   command, or publish changes.

## Done criteria

- [ ] Dependency installation and build/test/metadata steps in all five jobs receive no production Supabase or proxy credential.
- [ ] The fleet test rejects both current names and equivalent secret-expression placement in package build jobs.
- [ ] OIDC publish and Turbo cache boundaries remain unchanged and accepted.
- [ ] No package code, manifest, lockfile, release gate, or live publication behavior changes.
- [ ] Focused, discovery, script, repository, whitespace, and scope gates pass.

## STOP conditions

Stop on active-owner refusal; a focused test that genuinely requires live
production access; any credential value appearing in source, output, or logs;
workflow drift beyond the five build jobs; a required change to OIDC publish or
release-gate semantics; or any mandatory gate failing twice.

## Maintenance notes

Release build jobs should be treated as hostile-to-secrets: they execute a
dependency graph plus checkout-controlled code. Keep production credentials at
the narrowest operational step that truly needs them; package compilation and
tests are not such a step.
