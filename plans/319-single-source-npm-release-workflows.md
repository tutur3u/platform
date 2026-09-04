# Plan 319: Single-Source Governed npm Package Releases

> **Executor instructions:** Replace the 14 copied package-release state
> machines with one reusable workflow and one checked package registry while
> preserving each package's triggers, build graph, artifact, environment,
> readiness gate, smoke contract, and OIDC publication boundary. Roll out
> through a non-publishing Icons canary; do not convert the rest of the fleet if
> that canary differs from the frozen contract.
>
> **Drift check (run first):**
> `git diff --stat 5af8af5d91..HEAD -- .github/workflows/release-ai-package.yaml .github/workflows/release-apis-package.yaml .github/workflows/release-devbox-package.yaml .github/workflows/release-editor-package.yaml .github/workflows/release-google-package.yaml .github/workflows/release-hooks-package.yaml .github/workflows/release-icons-package.yaml .github/workflows/release-internal-api-package.yaml .github/workflows/release-sdk-package.yaml .github/workflows/release-supabase-package.yaml .github/workflows/release-types-package.yaml .github/workflows/release-typescript-config-package.yaml .github/workflows/release-ui-package.yaml .github/workflows/release-utils-package.yaml .github/workflows/reusable-release-package.yaml scripts/ci/release-workflows.test.js scripts/ci/package-release-workflows.test.js scripts/ci/package-release-config.js scripts/ci/package-release-config.test.js scripts/ci/package-release-runner.js scripts/ci/package-release-runner.test.js scripts/ci/package-release-readiness.js scripts/ci/package-release-readiness.test.js apps/docs/build/devops/github-actions-runbook.mdx tmp/agent-coordination`
> Stop on package-fleet, permission, protected-environment, OIDC, artifact,
> readiness, smoke, or active-owner drift.

## Status

- **Execution status:** BLOCKED — sequence after Plans 236/292/298 and obtain Forms/release/CI path transfer
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM-HIGH
- **Category:** architecture / DX / release security
- **Depends on:** Plans 236, 292, and 298; Forms/release/CI ownership transfer
- **Planned at:** commit `5af8af5d91`, 2026-08-12

## Why this matters

Fourteen governed package workflows independently copy the same reject, install,
version gate, dependency dispatch, build, pack, artifact, protected-environment,
and OIDC publish state machine across 5,273 YAML lines. Package identity and
build expectations are then repeated in a separate 14-entry test registry.
Fleet-wide changes such as Plans 236, 292, and 298 consequently require
synchronized edits across privileged publication code and two metadata
authorities, making package-specific drift increasingly likely.

## Current state and exact contract

- The governed wrappers are exactly `ai`, `apis`, `devbox`, `editor`, `google`,
  `hooks`, `icons`, `internal-api`, `sdk`, `supabase`, `types`,
  `typescript-config`, `ui`, and `utils`. At the snapshot they total 5,273
  lines. Do not enroll Legal or any other package whose publish/private decision
  is still owned by another plan.
- `release-hooks-package.yaml:15-180` and
  `release-google-package.yaml:15-180` show the common state machine; their
  differences are package path/name, package-specific validation/dependency
  builds, artifact directory/name, rejection text, and protected environment.
- `scripts/ci/release-workflows.test.js:1698-1917` separately repeats those
  differences in `PACKAGE_RELEASE_WORKFLOWS`. Extract that fleet contract from
  the already oversized general test instead of growing it.
- `package-release-readiness.js:68-113` discovers publishable packages by
  scraping package paths from workflow YAML. Once wrappers become thin, the
  canonical package registry must be its authority; do not preserve regex-based
  workflow discovery as a second registry.
- Create `scripts/ci/package-release-config.js` as the one declarative authority
  for each key: workflow filename/name; package path/name; rejection text;
  artifact directory/name; protected environment; ordered build/validation
  profile; dependency-dispatch behavior; and the installed-tarball smoke matrix
  from Plan 236. Reject duplicate keys, package paths/names, artifacts,
  environments, and workflow filenames.
- Create `package-release-runner.js` to resolve/validate a key and execute named
  stages with `spawnSync(command, argv, { cwd, shell: false })`. Package config
  may contain checked command/argv arrays, never shell fragments. The runner
  writes GitHub outputs through `GITHUB_OUTPUT`, prepares/verifies the exact
  tarball, and reports package-key-prefixed failures without exposing secrets.
- Create `.github/workflows/reusable-release-package.yaml` with
  `on.workflow_call` inputs `package-key`, optional `turbo-team`, and boolean
  `dry-run`; accept only the named optional `TURBO_TOKEN` and `TURBO_TEAM`
  secrets. Resolve the cache team as
  `${{ inputs.turbo-team || secrets.TURBO_TEAM }}` so Plan 292's current
  variable-then-secret fallback remains exact. Do not use `secrets: inherit`.
  Resolve all package metadata from the checked registry after checkout.
- Preserve least privilege through explicit job permissions:
  reject/config/build/pack jobs receive `contents: read` only; the readiness
  job receives only the current actions/contents permission it needs; the
  publish job alone receives `contents: read` and `id-token: write` and declares
  the registry-selected protected `environment`. `TURBO_TOKEN` is injected only
  into the build/cache step. Plan 292's production credential ban remains true.
- Each existing workflow remains a thin trigger wrapper with its current `name`,
  `push` branch/path filter, `workflow_dispatch`, and concurrency semantics;
  add one optional boolean `workflow_dispatch.inputs.dry-run` defaulting false.
  The caller job explicitly grants the minimum union ceiling required by the
  called jobs: `contents: read`, `actions: write`, and `id-token: write`. Jobs
  inside the reusable workflow must still downgrade independently, with
  `actions: write` limited to readiness/dependency dispatch and `id-token:
  write` limited to publish. Its only job calls the local reusable workflow by
  exact `./.github/workflows/reusable-release-package.yaml` path (Plan 298
  permits local refs), passes a literal package key, `vars.TURBO_TEAM`, and
  `${{ github.event_name == 'workflow_dispatch' && inputs.dry-run }}`, and maps
  only `secrets.TURBO_TOKEN` and `secrets.TURBO_TEAM`. Common workflow/config
  changes are validated by CI; they must not trigger 14 publications.
- Preserve the current public behavior: reject non-production publication;
  gate already-published versions; wait for/dispatch governed workspace
  dependencies and dependents exactly once; build the same dependency graph;
  pack one exact artifact; run Plan 236's installed-tarball smoke; upload the
  same artifact; publish only from the same protected environment with OIDC;
  and never publish in `dry-run`.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-development-tooling`,
`$tuturuuu-agent-coordination`, `$github`, and `$tuturuuu-commit`; read the
GitHub Actions reusable-workflow documentation and the package release section
of the runbook. Do not start until Plans 236/292/298 are integrated, because
this plan consolidates their final smoke, credential, and immutable-action
contracts. Obtain exact transfer of `release-workflows.test.js` from the Forms
handoff and every affected release/CI workflow. Never inspect secret values.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Registry/runner | `node --test scripts/ci/package-release-config.test.js scripts/ci/package-release-runner.test.js scripts/ci/package-release-readiness.test.js` | all 14 unique configs, argv-only stages, readiness, and failure fixtures pass |
| Workflow contract | `node --test scripts/ci/package-release-workflows.test.js scripts/ci/release-workflows.test.js scripts/ci/check-workflow-config.test.js scripts/ci/github-actions-sha-pinning.test.js` | thin wrappers, reusable permissions/secrets/environments, and pinned refs pass |
| Fleet shape | `find .github/workflows -maxdepth 1 -name 'release-*-package.yaml' -print | sort && wc -l .github/workflows/release-*-package.yaml .github/workflows/reusable-release-package.yaml` | exactly 14 thin wrappers plus one reusable workflow; copied state machines are absent |
| Discovery | `node scripts/run-script-tests.js --list | rg '^scripts/ci/(package-release-config|package-release-runner|package-release-readiness|package-release-workflows|release-workflows).*\.test\.js$' && bun test:scripts` | all new/existing package release suites are canonically discovered and pass |
| YAML | `ruby -e 'require "yaml"; ARGV.each { |f| YAML.load_file(f, aliases: true) }' .github/workflows/release-*-package.yaml .github/workflows/reusable-release-package.yaml` | every workflow parses |
| Repository/docs | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope/size | `git status --short && wc -l scripts/ci/release-workflows.test.js scripts/ci/package-release-config.js scripts/ci/package-release-runner.js scripts/ci/package-release-workflows.test.js` | only in-scope files changed; new/extracted modules stay focused and the oversized legacy test shrinks |

## Scope

**In scope:** the 14 exact trigger wrappers; one reusable package-release
workflow; one canonical config and argv-only runner with focused tests;
readiness discovery migration; extraction of fleet assertions from the general
release test; package-release operations documentation.

**Out of scope:** package source/manifests/versions/changelogs; `bun.lock`;
adding/removing publishable packages; changing release triggers, dependency
ordering, artifact contents, smoke imports, protected environments, npm access,
or OIDC policy; live publication without operator approval; Release Please
behavior; unrelated workflow normalization.

## Git workflow

- Branch: `refactor/single-source-package-releases` in an isolated worktree;
  run `bun setup` immediately.
- Conventional Commit: `refactor(ci): single-source package releases`.
- Keep the Icons canary and remaining fleet conversion as separately reviewable
  commits. Do not push/open a PR or dispatch workflows unless instructed. Claim
  the commit window before staging.

## Steps

1. Freeze all 14 existing contracts in config/runner/workflow tests before
   moving YAML. Add red fixtures for unknown/duplicate config, shell fragments,
   unlisted secrets, missing/excess caller permission ceilings, job permission
   downgrades, missing protected environment, absent/unforwarded dry-run input,
   lost Turbo variable/secret fallback, dry-run publish, package mismatch,
   wrong artifact, and missing smoke profile.
2. Extract the fleet registry/assertions from `release-workflows.test.js` into
   focused files and migrate `package-release-readiness.js` to the canonical
   registry. Keep backward-compatible exports used by current tests until all
   callers move, then delete workflow scraping.
3. Implement the reusable workflow and argv-only stage runner. Make every job's
   permissions, inputs, environment, outputs, and secret exposure explicit;
   preserve all current gates and Plan 236/292/298 invariants.
4. Convert only `release-icons-package.yaml` to a thin wrapper. With explicit
   operator approval after integration on `production`, dispatch it with
   its boolean `dry-run: true` workflow-dispatch input; require green config/build/pack/smoke/artifact jobs, a skipped
   publish job, the exact expected artifact, and no unexpected credential or
   permission use. Record the run URL in the plan's execution notes. STOP on
   any mismatch.
5. After the canary is approved, convert the other 13 wrappers in bounded,
   reviewable groups. For every wrapper compare old/new name, triggers, paths,
   concurrency, package key, environment, artifact, build profile, dependency
   graph, smoke imports, and rejection text through generated contract tests.
6. Update the runbook and run registry/runner, workflow, discovery, full script,
   YAML, repository, docs, whitespace, scope, and source-size gates. Monitor the
   first real release from the reusable workflow as an operator follow-up; do
   not manufacture a version bump.

## Test plan

- Registry fixtures cover all 14 exact configurations and uniqueness/required
  fields. Runner tests mock `spawnSync`, filesystem, GitHub outputs, registry,
  artifacts, and release gates; they never install, publish, or call live npm.
- Workflow tests parse both YAML extensions and assert thin wrapper triggers,
  literal keys, named-secret mapping, reusable job DAG, least privilege,
  environment placement, dry-run publish exclusion, artifact handoff, OIDC, and
  immutable remote refs.
- Readiness tests prove dependency/dependent discovery comes from the registry,
  not YAML strings, and preserves dispatch/wait behavior.

## Done criteria

- [ ] One checked registry is the only package identity/build/artifact/environment/smoke authority for all 14 releases.
- [ ] One reusable workflow owns the state machine; every package workflow is a thin trigger wrapper with frozen behavior.
- [ ] Non-publish jobs cannot access OIDC or production credentials, and no wrapper uses broad secret inheritance.
- [ ] The operator-approved Icons dry run matches the old contract and does not publish before the remaining fleet converts.
- [ ] All focused, workflow, discovery, script, YAML, repository, docs, whitespace, scope, and size gates pass.

## STOP conditions

Stop on incomplete Plans 236/292/298; missing exact-path transfer; a package
whose old contract cannot be represented without arbitrary shell; a GitHub
reusable-workflow limitation that changes permissions, environment secrets,
OIDC, outputs, or artifacts; canary publication or mismatch; external
consumer/release automation depending on an undocumented workflow shape; any
secret value in output; or a mandatory gate failing twice.

## Maintenance notes

Add future governed packages to the registry and generate/validate a thin
wrapper; never copy the state machine again. Dependabot remains responsible for
immutable action updates, and the first real release after structural changes
must be monitored through publish and registry availability.
