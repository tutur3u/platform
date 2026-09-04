# Plan 124: Put UI Singleton Runtimes at the Host Boundary

> **Executor instructions:** Move React, React DOM, TanStack Query, and
> TanStack Table out of the public UI package's production dependency graph and
> prove that a packed consumer shares the host runtimes. Do not execute while
> another lane owns `bun.lock`.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/ui/package.json packages/ui/README.md packages/ui/src packages/ui/scripts/verify-packed-host-boundary.mjs packages/editor/package.json .github/workflows/release-ui-package.yaml scripts/ci/package-release-readiness.js scripts/ci/package-release-readiness.test.js scripts/ci/prepare-npm-package-manifest.js bun.lock`
> Stop on manifest, peer-range, release-workflow, or lockfile drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** Dependencies / public package boundary
- **Depends on:** Plan 123; Mail catch-all lockfile ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

`@tuturuuu/ui` is a public component package used by 36 workspace manifests,
but it installs React and React DOM as ordinary runtime dependencies. It also
declares TanStack Query/Table simultaneously as runtime and peer dependencies.
A standalone host whose compatible versions do not deduplicate can receive a
second React or Query runtime, causing invalid-hook failures or making UI hooks
unable to see the host's `QueryClientProvider`. The manifest currently obscures
which side owns upgrades for these singleton contexts.

## Current state

- `packages/ui/package.json:10-12` publishes the package publicly.
- `packages/ui/package.json:82-83,145-148` places Query, Table, React, and React
  DOM in `dependencies`.
- `packages/ui/package.json:172-201` also places Query/Table in
  `devDependencies` and `peerDependencies`, with Query using `^5.101.4` for
  development and `^5.101.2` for the peer/runtime contract. React and React DOM
  are absent from both dev and peer fields.
- `packages/ui/src/hooks/use-workspace-members.ts:3` and
  `packages/ui/src/hooks/time-blocking-provider.tsx:3` are representative
  Query-context consumers; there are many more.
- `packages/editor/package.json:44-54` is the repository precedent: React and
  React DOM are host peers while tests/types resolve through development
  dependencies.
- `.github/workflows/release-ui-package.yaml:64-68,107-110,156-165` gates,
  tests, prepares, and packs the public artifact. The packed-manifest contract
  must be verified rather than inferred from workspace hoisting.
- `tmp/agent-coordination/20260711-134432-codex-mail-catchall-ux.md:12`
  explicitly owns `bun.lock`; this plan remains blocked until that path is
  transferred or released.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-development-tooling`, and
`$tuturuuu-agent-coordination`. Confirm Plan 123 is DONE and the Mail handoff no
longer owns `bun.lock`. Re-run tracked-source searches for all four packages
before dependency commands. Never manually edit dependency fields; use Bun.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Remove production edges | `cd packages/ui && bun remove react react-dom @tanstack/react-query @tanstack/react-table` | all four leave `dependencies` |
| Add test runtimes | `cd packages/ui && bun add --dev 'react@^19.2.8' 'react-dom@^19.2.8' '@tanstack/react-query@^5.101.4' '@tanstack/react-table@^9.0.0'` | all four appear in `devDependencies` without downgrading the existing Query test runtime |
| Declare host peers | `cd packages/ui && bun pm pkg set 'peerDependencies.react=^19.2.8' 'peerDependencies.react-dom=^19.2.8' 'peerDependencies.@tanstack/react-query=^5.101.2' 'peerDependencies.@tanstack/react-table=^9.0.0'` | all four are non-optional peers |
| Synchronize lockfile | `bun install --lockfile-only` | `bun.lock` reflects only the intended field changes |
| Focused contract | `bun --cwd packages/ui vitest run src/public-runtime-boundary.test.ts` | manifest boundary tests pass |
| Packed host boundary | `bun packages/ui/scripts/verify-packed-host-boundary.mjs` | a disposable repo-relative package copy is prepared/packed, an isolated host renders with one React and Query runtime, and temporary directories are removed |
| Package suite | `bun run --cwd packages/ui test` | all tests pass |
| Package typecheck | `bun run --cwd packages/ui type-check` | exit 0 |
| Release tooling | `node --test scripts/ci/package-release-readiness.test.js scripts/ci/prepare-npm-package-manifest.test.js` | all tests pass |
| Workspace dependency gate | `node --test scripts/check-workspace-dependencies.test.js` | all tests pass |
| Workspace gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:**

- `packages/ui/package.json` through the exact Bun commands above
- `packages/ui/README.md` only to document the final peer prerequisites after
  Plan 123
- `packages/ui/src/public-runtime-boundary.test.ts` (create)
- `packages/ui/scripts/verify-packed-host-boundary.mjs` (create)
- mechanical `bun.lock` updates caused by the four dependency-field moves
- ignored repo-relative package copies and operating-system consumer
  directories created and safely removed by the focused verification script
- `plans/README.md` only for the executor's status update

**Out of scope:**

- component, hook, or provider behavior
- package exports, versions, changelogs, or release workflow changes
- widening peer ranges beyond the versions already supported by the repository
- unrelated dependency upgrades or lockfile resolution churn
- generic release-tool refactors

**Read-only drift evidence (inspect, do not edit):**

- `packages/editor/package.json`
- `.github/workflows/release-ui-package.yaml`
- `scripts/ci/package-release-readiness.js`
- `scripts/ci/package-release-readiness.test.js`
- `scripts/ci/prepare-npm-package-manifest.js`
- existing `packages/ui/src/**` files other than the new manifest test

## Git workflow

Use isolated branch `chore/ui-singleton-peers`, run `bun setup`, and commit
`fix(ui)!: move singleton runtimes to host peers`. Include a `BREAKING CHANGE:`
footer explaining the four host requirements; do not manually bump the package
version because Release Please owns versioning. Claim and release the commit
window. Do not push unless instructed.

## Steps

### Step 1: Re-prove runtime use and supported ranges

Search all tracked UI source/configuration for imports of React, React DOM,
TanStack Query, and TanStack Table. Confirm React/Query/Table are real public
runtime requirements, React DOM is required by rendered components/tests, and
the existing versions represent the intended supported host ranges. Compare
the React contract to `packages/editor/package.json:44-54`.

If any runtime must intentionally be package-owned rather than host-owned, stop
and report the exact consumer/context reason instead of applying a partial
boundary.

**Verify:** run
`rg -n "from ['\"](react|react-dom|@tanstack/react-query|@tanstack/react-table)['\"]|\"(react|react-dom|@tanstack/react-query|@tanstack/react-table)\"" packages/ui/src packages/ui/package.json packages/editor/package.json`.
Expected: exit 0; record the package-owned versus host-owned disposition for
all four runtimes in the implementation summary before Step 2.

### Step 2: Move singleton packages through Bun only

Run the exact remove, add-dev, peer-set, and lockfile-sync commands in order.
The final manifest invariant is:

| Package | dependencies | devDependencies | peerDependencies |
| --- | --- | --- | --- |
| `react` | absent | `^19.2.8` | `^19.2.8` |
| `react-dom` | absent | `^19.2.8` | `^19.2.8` |
| `@tanstack/react-query` | absent | `^5.101.4` | `^5.101.2` |
| `@tanstack/react-table` | absent | `^9.0.0` | `^9.0.0` |

Inspect `bun.lock` after each command. Stop on unrelated version changes rather
than normalizing or accepting them.

**Verify:** run the four dependency commands from the command table, then run
`git diff -- packages/ui/package.json bun.lock`. The manifest must match the
table above and the lockfile diff must contain no unrelated resolution change.

### Step 3: Add a release-enrolled manifest regression test

Create `packages/ui/src/public-runtime-boundary.test.ts`, following the
repository-reading pattern in `packages/ui/src/globals.test.ts`. Assert the
four packages are absent from `dependencies`, present with the exact ranges in
both `devDependencies` and `peerDependencies`, and not marked optional in
`peerDependenciesMeta`. Because the UI release workflow already runs the
package suite, this test becomes part of publication readiness without changing
the workflow.

Create a `Peer dependencies` section in `packages/ui/README.md` if Plan 123 did
not add one, or update that exact section if it exists. Name all four install-
time host peers and distinguish them from component-specific provider setup.
Do not claim React/Query providers are globally required for components that do
not use them.

**Verify:** run
`bun --cwd packages/ui vitest run src/public-runtime-boundary.test.ts`; it must
pass and prove the final manifest plus README peer contract.

### Step 4: Prove the packed host contract outside workspace hoisting

Create `packages/ui/scripts/verify-packed-host-boundary.mjs`. The script must:

1. resolve the repository root and create a uniquely named ignored package copy
   under `tmp/` plus a separate consumer directory under the operating system's
   temporary directory;
2. copy `packages/ui` into the repo-relative directory, then call the exported
   `preparePackageManifest({ repoRoot, packageDir })` helper with that copy's
   repo-relative path (do not invoke the CLI against a directory outside the
   repository and do not mutate the real manifest);
3. run `npm pack --ignore-scripts` in the prepared copy, install the tarball and
   the exact four compatible host peers in the separate consumer, compile and
   render a Query-backed UI hook/component under the host
   `QueryClientProvider`, and inspect the installed dependency graph;
4. assert the tarball manifest holds all four as non-optional peers and not
   production dependencies, and assert exactly one resolved React and Query
   runtime; and
5. remove only the two directories it created in a `finally` block after first
   verifying their resolved paths remain beneath the expected repo `tmp/` and
   operating-system temp roots.

Inspect the tarball manifest: the four singleton packages are peers, not
production dependencies. Do not use monorepo-hoisted modules as evidence.

**Verify:** run `bun packages/ui/scripts/verify-packed-host-boundary.mjs`.
Expected: exit 0, explicit single-runtime and peer-contract assertions pass,
the real `packages/ui/package.json` is byte-identical before/after, and no
temporary directory remains.

### Step 5: Run all package and repository gates

Run the focused contract, full package test/typecheck, release-tool tests,
workspace-dependency test, `bun check`, and `git diff --check`. Inspect status:
only the in-scope manifest, README, focused test, mechanical lockfile changes,
and advisor status row may differ.

## Test plan

- Manifest test rejects each singleton package if it re-enters
  `dependencies`.
- Manifest test requires all four non-optional peer contracts and local test
  dependencies.
- Isolated packed consumer proves host-provider context and single runtime
  resolution.
- Full UI suite/typecheck proves local test tooling still resolves React/DOM and
  Query/Table.
- Release preparation is run only against a temporary copy.

## Done criteria

- [ ] React, React DOM, Query, and Table are absent from production
      `dependencies` and present as non-optional peers plus dev dependencies.
- [ ] `bun.lock` contains only the mechanical dependency-boundary update.
- [ ] The README names host peer requirements and component-specific provider
      setup accurately.
- [ ] A release-enrolled test guards the manifest invariant.
- [ ] An isolated packed consumer renders with exactly one React and Query
      runtime.
- [ ] All listed package, release-tool, workspace, and whitespace gates pass.

## STOP conditions

Stop if Plan 123 is not DONE, `bun.lock` ownership remains active, source or a
supported external consumer requires package-owned singleton runtimes, a peer
range must be widened beyond current repository support, Bun rewrites unrelated
lockfile versions, the prepared packed copy differs outside workspace-range
normalization, or any mandatory gate fails twice after one reasonable fix.

## Maintenance notes

React and context-bearing data libraries belong to the host boundary of public
component packages. Review future UI dependency additions for singleton/provider
semantics and extend the focused manifest test when another host-owned runtime
is introduced.
