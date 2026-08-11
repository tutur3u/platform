# Plan 236: Smoke-Test Governed npm Tarballs Before Publication

> **Executor instructions:** Install and import the exact `.tgz` produced for
> every governed package after manifest rewriting and before OIDC publication;
> source-workspace tests are not evidence that the registry artifact works.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- '.github/workflows/release-*-package.yaml' scripts/ci/package-release-readiness.js scripts/ci/package-release-readiness.test.js scripts/ci/prepare-npm-package-manifest.js scripts/ci/release-workflows.test.js scripts/ci tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plans 228/232 and the Forms/Pay release lanes
  overlap the shared readiness/workflow test surfaces
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** DX / release integrity / dependency governance
- **Depends on:** exact release workflow/readiness path transfer; coordinate
  Plans 228 and 232
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

All fourteen package workflows test workspace source, then later rewrite
`workspace:` dependencies, optionally extract vendored code/change exports, and
pack a different artifact. The publish job verifies only tarball count, name,
and version. Missing files, bad rewritten dependencies, or broken exports can
therefore pass CI and be irreversibly published through OIDC.

## Current state and exact contract

- Govern exactly these workflow packages: `ai`, `apis`, `devbox`, `editor`,
  `google`, `hooks`, `icons`, `internal-api`, `sdk`, `supabase`, `types`,
  `typescript-config`, `ui`, and `utils`. A workflow/package set mismatch is a
  test failure, not an implicit allowlist update.
- Add checked configuration `scripts/ci/npm-package-artifact-smoke.json` with
  one entry per package: package directory/name, runner (`node` or `bun`), and
  explicit public import specifiers. Use root imports for dist packages;
  source-export packages must include at least one stable real subpath (for
  example AI `credits/constants`, APIs `finance/request-access`, Icons
  `lucide-static`, UI `badge`, Utils `constants`). The TypeScript-config entry
  is a file contract that parses `base.json`, `nextjs.json`,
  `react-library.json`, and `typecheck.json` from the installed package.
- The smoke command creates a unique temporary project, installs the exact
  tarball through npm with lifecycle scripts disabled, executes every configured
  import/file assertion from the installed tree, and always removes the temp
  directory. It must not resolve the source workspace through Bun links.
- Its workflow-facing CLI is exactly
  `node scripts/ci/npm-package-artifact-smoke.js --package-dir <packages/name> --tarball <absolute-tgz>`.
  It requires one regular `.tgz`, verifies the tarball manifest name matches the
  configured package, and rejects missing, multiple, relative, or directory
  targets. `--prepare-and-smoke <package-dir>` is the separate local integration
  mode and must call the same direct-tarball implementation after staging/pack.
- Each workflow runs the smoke immediately after `npm pack` and before artifact
  upload. The OIDC publish job remains dependency-free and publish-only.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`; read their complete
release/CI references. Execute from a base containing completed Plan 004 so new
`scripts/**.test.js` files are discovered. Obtain exact transfer from the Forms
handoff for `release-workflows.test.js`, Pay for package workflow registration,
and Plans 228/232 for readiness files before editing.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused helper | `node --test scripts/ci/npm-package-artifact-smoke.test.js scripts/ci/package-release-readiness.test.js scripts/ci/release-workflows.test.js` | clean install/import, failure fixtures, fleet enrollment, and workflow ordering pass |
| Discovery | `bun test:scripts --list` | the new artifact-smoke test is listed |
| Full scripts | `bun test:scripts` | all discovered script tests pass |
| AI real smoke | `node scripts/ci/npm-package-artifact-smoke.js --prepare-and-smoke packages/ai` | helper stages tracked files in a unique temp repo, prepares/packs/installs/imports AI, cleans up, and leaves the checkout unchanged |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** one helper, checked smoke matrix, focused tests, package readiness
invariant, all fourteen package-release workflows, and the shared workflow
contract test. **Out of scope:** package source/manifests/versions, dependencies,
lockfile, Release Please config, publish permissions/environments, registry
consumer decisions in Plans 228/232, or changing the OIDC publish job.

## Steps

1. Add red fixtures for a valid tarball, missing exported file, unresolved
   runtime dependency, missing configured specifier, wrong package name,
   lifecycle-script attempt, source-workspace resolution, and config/workflow
   fleet mismatch. Tests use local fixture tarballs and no registry/network.
2. Add the exact fourteen-entry JSON matrix and schema validation. Require at
   least one runtime import for every code package and the four JSON assertions
   for TypeScript-config. Reject unknown fields, duplicate package dirs/names,
   wildcard smoke specifiers, and packages outside governed workflows.
3. Implement the helper with `mkdtemp`, a minimal private ESM package manifest,
   `npm install <absolute-tarball> --ignore-scripts --no-audit --no-fund`, then
   the configured Node/Bun dynamic imports from that temp cwd. Verify the
   resolved module/file is inside the installed package. Its
   `--prepare-and-smoke <package-dir>` mode must stage only tracked repository
   files into a second temp root, run the existing preparation and `npm pack`
   there, then feed the tarball through the same installer. Preserve the first
   failure code and clean up both roots in `finally`; print paths/names only,
   never env values or registry credentials.
4. Extend package release readiness to require a matrix entry for every
   workflow-published package and no extras. Do not duplicate the unsupported
   workspace-edge decision from Plan 228; compose with it when that plan lands.
5. In every one of the fourteen workflows, invoke the helper on the single
   packed tarball before `actions/upload-artifact`, using the exact
   `--package-dir ... --tarball "$PACKAGE_TARBALL"` interface after a fail-closed
   one-file `find`/count check. Keep install/build activity out of `publish-npm`
   so the OIDC authority boundary is unchanged.
6. Run focused tests, discovery/full script suite, then exercise the real AI
   package through `--prepare-and-smoke` and prove `git diff --exit-code` for
   every package manifest/source path. Run repository, YAML/whitespace, and
   exact-scope gates.

## Done criteria

- [ ] Every governed workflow installs and imports its exact prepared tarball
      before upload/publish.
- [ ] The checked matrix and readiness gate cover exactly all fourteen governed
      packages and fail closed on drift.
- [ ] Smoke execution cannot fall back to workspace source or lifecycle scripts.
- [ ] The OIDC publish job remains artifact-only.
- [ ] Focused/full script, real disposable tarball, repository, and whitespace
      gates pass with no package/lockfile changes.

## STOP conditions

Stop on active shared release ownership, a package with no supportable public
import/file contract, need to publish/install an unavailable dependency before
its workflow orders it, registry credentials in output, tracked manifest drift,
OIDC-job dependency installation, or any mandatory gate failing twice.
