# Plan 074: Put Masonry React at the Host Boundary

> **Executor instructions:** Move React to a peer/dev contract, remove unused
> React DOM, and prove the packed package in an isolated host. Do not execute
> while another lane owns `bun.lock`.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/masonry/package.json packages/masonry/src packages/masonry/README.md packages/masonry/CHANGELOG.md bun.lock scripts/ci/prepare-npm-package-manifest.test.js`
> Stop on manifest/export/lockfile drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** Dependencies / package boundary
- **Depends on:** Mail catch-all lockfile ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Masonry is a public React component package but owns React and unused React DOM
as runtime dependencies. Hosts can receive a second React copy and invalid-hook
failures, while the README incorrectly promises zero dependencies and names an
old release.

## Current state

- `packages/masonry/package.json:2,18-21` is version 0.5.0 and lists `react`
  and `react-dom` in dependencies.
- `src/masonry.tsx:3-10` imports React types/hooks; no tracked package source
  imports React DOM.
- `README.md:5-13` says 0.3.10 and “zero external dependencies.”
- Do not manually bump versions or changelogs; Release Please owns them.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-development-tooling`, and
`$tuturuuu-agent-coordination`. Wait for the Mail handoff to release/transfer
`bun.lock`. Re-run complete tracked-source usage searches before dependency
commands.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Remove runtime edges | `cd packages/masonry && bun remove react react-dom` | direct production edges are removed |
| Add local test renderers | `cd packages/masonry && bun add --dev 'react@^19.2.8' 'react-dom@^19.2.8'` | both appear in devDependencies |
| Declare host React | `cd packages/masonry && bun pm pkg set 'peerDependencies.react=^19.2.8'` | React remains dev-only locally and also appears as a non-optional peer |
| Synchronize lockfile | `bun install --lockfile-only` | root lock reflects the peer/dev manifest with no unrelated version drift |
| Package tests | `bun run --cwd packages/masonry test` | all pass |
| Package build | `bun run --cwd packages/masonry build` | exit 0 |
| Release tooling | `node --test scripts/ci/prepare-npm-package-manifest.test.js scripts/ci/package-release-readiness.test.js` | all pass |
| Workspace gate | `node --test scripts/check-workspace-dependencies.test.js && bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/masonry/package.json`
- `packages/masonry/README.md`
- only mechanical `bun.lock` changes; React and React DOM remain installed for development
- an isolated temporary packed-consumer fixture outside the worktree
- `plans/README.md` only for status

Do not change component behavior/exports, versions, changelog, or release
workflow; Plan 075 owns release automation.

## Git workflow

Use isolated branch `chore/masonry-react-peer`, run `bun setup`, and commit
`chore(masonry): move react to peer dependency`. Claim the commit window; do
not push unless instructed.

## Steps

### Step 1: Re-prove dependency use

Search all package source/config. Confirm React is the only runtime import and
React DOM is absent. Inspect emitted declarations and retain React type
resolution through the peer/dev contract.

### Step 2: Change dependencies only through Bun

Run the exact commands above. React must exist in both `devDependencies` and
non-optional `peerDependencies`; React DOM must exist only in
`devDependencies` because Testing Library renders through it. Neither may
remain in production `dependencies`. Inspect `bun.lock` after each command and
run the exact root lockfile synchronization after `bun pm pkg set`; stop on
unrelated resolution changes.

### Step 3: Correct installation documentation

Remove the hard-coded package version and zero-dependency claim. State the
supported React peer range and host-install responsibility without changing
release history or marketing the unpublished work as a new version.

### Step 4: Prove the packed host contract

Pack the built artifact into a `mktemp -d` directory. Install it in a minimal
synthetic host with compatible React and compile/render one Masonry import.
Inspect the tarball manifest: React is a peer; React DOM is absent from the
production dependency/peer contract. Do not use
the monorepo's hoisted modules as this proof.

## Test plan

Run existing tests/build and the isolated packed-host smoke compile. The host
must have exactly one React installation. A missing-peer install may warn or
fail according to the package manager; do not encode a brittle message match.

## Done criteria

- [ ] React is a non-optional peer plus local dev dependency, not a production dependency.
- [ ] React DOM is dev-only and absent from source and the packed production contract.
- [ ] README states the current host contract without a stale fixed version.
- [ ] Tests/build/packed-host/release tooling/`bun check` pass.

## STOP conditions

Stop if lockfile ownership remains active, package source actually uses React
DOM, supported consumers require a different peer range, Bun rewrites unrelated
versions, or the packed host cannot resolve a single React instance.

## Maintenance notes

Public React libraries should share the host's renderer. Keep framework peers
explicit and test package artifacts outside workspace hoisting.
