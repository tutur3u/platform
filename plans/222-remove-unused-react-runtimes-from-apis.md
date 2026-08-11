# Plan 222: Remove Unused React Runtimes from the APIs Package

> **Executor instructions:** Remove only the unused React runtime dependency
> edges from the independently published server-helper package and verify the
> packed artifact as an external consumer would see it.
>
> **Drift check (run first):**
> `git diff --stat 968bd12018..HEAD -- packages/apis/package.json packages/apis/src packages/apis/README.md bun.lock .github/workflows/release-apis-package.yaml scripts/ci/package-release-readiness.test.js scripts/ci/release-workflows.test.js tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — active Mail handoff owns `bun.lock`
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** dependencies / package publishing
- **Depends on:** explicit `bun.lock` transfer
- **Planned at:** commit `968bd12018`, 2026-08-11

## Why this matters

`@tuturuuu/apis` is a public package of server actions and route helpers, but
its production manifest requires React and React DOM despite having no source
import of either runtime. Published consumers inherit unnecessary UI runtime
edges and can receive duplicate React trees for code that never renders UI.

## Current state and exact contract

- `packages/apis/package.json:17-24` declares `react` and `react-dom` under
  `dependencies`; only `@types/react` is needed for any type surface.
- A complete `packages/apis/src/**` search at the planned SHA finds no React or
  React DOM import/require/reference. The package exports TypeScript route/action
  helpers and is packed by `.github/workflows/release-apis-package.yaml`.
- Remove the two runtime declarations with Bun from the owning workspace. Do
  not remove `@types/react`, change package exports, versions, changelog, JSR
  metadata, or release workflow behavior.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/package
instructions. Wait for explicit Mail lockfile transfer; run the package manager,
never hand-edit dependency declarations or `bun.lock`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Source inventory | `! rg -n "from ['\"]react|require\\(['\"]react|react-dom/" packages/apis/src` | exit 0 before and after removal |
| Remove | `cd packages/apis && bun remove react react-dom` | manifest and lockfile update only expected dependency edges |
| Package | `bun run --cwd packages/apis type-check && bun run --cwd packages/apis test` | both exit 0 |
| Release/packed contracts | `node --test scripts/ci/package-release-readiness.test.js scripts/ci/prepare-npm-package-manifest.test.js scripts/ci/release-workflows.test.js` | production manifest preparation and packed-tarball assertions pass |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** `packages/apis/package.json`; package-manager-produced `bun.lock`
changes for removing exactly `react` and `react-dom`; add the APIs packed-
manifest regression to `scripts/ci/package-release-readiness.test.js`.

**Out of scope:** source/export rewrites, Day.js (separately deferred), peer
dependency redesign, package/version/changelog/JSR changes, release workflow
edits, or dependency cleanup in another workspace.

## Steps

1. Run zsh-safe source/config/generated-declaration inventory for React runtime
   use and record the manifest/lockfile baseline. Add a red release-readiness
   test that copies the package into a temporary fixture, exercises the real
   `preparePackageManifest` production helper with workspace versions, packs the
   prepared copy, extracts `package/package.json`, and asserts React/React DOM
   are absent while expected workspace dependencies were rewritten. **Verify:**
   it fails on the current published manifest.
2. Run the owning-workspace Bun removal. Inspect the lock diff and restore any
   unrelated resolution churn. **Verify:** a Node manifest assertion reports
   both dependency keys absent while all other manifest keys are unchanged.
3. Run package, prepared/packed release-readiness, repository, whitespace, and
   exact-scope gates. The test must clean its temporary directory on success and
   failure and must not rewrite the real package manifest.

## Done criteria

- [ ] The published manifest no longer declares React or React DOM runtimes.
- [ ] No package source/generated contract imports them.
- [ ] Only the two dependency edges and their necessary lockfile graph changed.
- [ ] The production-prepared tarball manifest is inspected and retains expected
      rewritten workspace dependencies without React/React DOM.
- [ ] Package/release/pack/repository/whitespace gates pass.

## STOP conditions

Stop on unresolved lock ownership, any runtime or generated-type consumer,
unexpected lockfile churn, need to change peer/export/release contracts, packed
artifact drift beyond manifest dependencies, or any mandatory gate failing
twice.
