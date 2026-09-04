# Plan 264: Put Utils Host Runtimes at the Peer Boundary

> **Executor instructions:** Make the public Utils artifact consume the host's
> Next and React runtimes, remove its unused React DOM edge, and prove the exact
> prepared tarball imports representative Next and React subpaths in isolation.

> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/utils/package.json packages/utils/src packages/utils/README.md scripts/ci/npm-package-artifact-smoke.json scripts/ci/npm-package-artifact-smoke.test.js scripts/ci/npm-package-artifact-smoke.js bun.lock tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** dependencies / public package boundary
- **Depends on:** Plan 236; Mail lockfile transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The public `@tuturuuu/utils` package wildcard-exports raw TypeScript and places
Next, React, and React DOM in ordinary dependencies. Its exported modules execute
Next runtime helpers and React hooks/cache, so clean hosts can receive package-
owned framework copies rather than a declared singleton host contract. React
DOM has no Utils source import at all. Workspace hoisting hides the boundary.

## Exact final manifest

| Package | dependencies | devDependencies | peerDependencies |
| --- | --- | --- | --- |
| `next` | absent | `^16.3.0` | `^16.3.0` |
| `react` | absent | `^19.2.8` | `^19.2.8` |
| `react-dom` | absent | absent | absent |

Both peers are non-optional. Use Bun commands only:

1. `(cd packages/utils && bun remove next react react-dom)`
2. `(cd packages/utils && bun add --dev 'next@^16.3.0' 'react@^19.2.8')`
3. `(cd packages/utils && bun pm pkg set 'peerDependencies.next=^16.3.0' 'peerDependencies.react=^19.2.8')`
4. `bun install --lockfile-only`

Plan 236's installed-artifact matrix must import one Next runtime subpath
(`@tuturuuu/utils/api-proxy-guard`) and one React runtime subpath
(`@tuturuuu/utils/workspace-helper`) from the exact prepared Utils tarball in a
clean host that explicitly installs compatible Next/React/React DOM. The host
must resolve one Next and one React runtime. React DOM is a host requirement of
Next, not a direct Utils peer.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-development-tooling`,
`$tuturuuu-ci-docs`, `$tuturuuu-agent-coordination`, and `$tuturuuu-commit`.
Execute only after Plan 236 lands and the Mail handoff transfers `bun.lock`.
Re-prove the complete production/test import inventory before changing fields;
use Bun, never manual manifest edits.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Manifest contract | `node -e "const p=require('./packages/utils/package.json'); if(p.dependencies?.next||p.dependencies?.react||p.dependencies?.['react-dom']||p.devDependencies?.next!=='^16.3.0'||p.devDependencies?.react!=='^19.2.8'||p.devDependencies?.['react-dom']||p.peerDependencies?.next!=='^16.3.0'||p.peerDependencies?.react!=='^19.2.8'||p.peerDependencies?.['react-dom']) process.exit(1)"` | exact table above holds |
| Focused package | `bun --cwd packages/utils vitest run src/public-runtime-boundary.test.ts && bun run --cwd packages/utils type-check` | manifest test and types pass |
| Artifact smoke | `node --test scripts/ci/npm-package-artifact-smoke.test.js && node scripts/ci/npm-package-artifact-smoke.js --prepare-and-smoke packages/utils` | clean prepared tarball imports both affected subpaths with host runtimes |
| Workspace dependency gate | `node --test scripts/check-workspace-dependencies.test.js` | dependency policy passes |
| Repository | `bun check && git diff --check` | all checks and whitespace pass |

## Scope

In scope: Utils manifest; mechanical lockfile changes; a focused manifest test;
a short peer-requirements README section; Plan 236's existing smoke matrix/test
only to enroll the two exact subpaths and host packages.

Out of scope: Utils source behavior/exports, splitting the package, changing
Next/React supported ranges, other dependency cleanup, release workflow logic,
versions/changelog, or publishing.

## Steps

1. Re-run source/config imports. Confirm production Utils directly executes
   Next and React, while React DOM has zero direct runtime/type/test use. If any
   React DOM use exists, stop and revise the exact contract before removal.
2. Add a red `public-runtime-boundary.test.ts` asserting the exact manifest
   table, non-optional peers, and README prerequisites. Extend the landed Plan
   236 Utils smoke entry with both affected public subpaths.
3. Run the four Bun commands in order. Inspect `bun.lock` after each step and
   reject unrelated resolution/install-mode churn.
4. Run the exact prepared-tarball smoke. Assert installed modules resolve from
   the temporary consumer, both imports execute, and dependency inspection
   finds one host Next and React runtime with no nested Utils copies.
5. Run focused/package, artifact, workspace, repository, whitespace, and scope
   gates. Commit with `fix(utils)!: move host runtimes to peers` and a BREAKING
   CHANGE footer naming compatible Next and React host requirements; Release
   Please owns versions.

## Done criteria

- [ ] Next and React are non-optional peers plus dev dependencies, not runtime dependencies.
- [ ] Unused React DOM is absent from every Utils dependency field.
- [ ] The exact prepared tarball imports both representative subpaths with one host runtime.
- [ ] Lockfile diff is mechanical and no source/export/release behavior changed.
- [ ] Focused, artifact, typecheck, workspace, repository, and scope gates pass.

## STOP conditions

Stop on a real React DOM import; evidence that Utils intentionally owns a
separate Next/React runtime; incomplete Plan 236 or smoke-path ownership;
unavailable Mail lockfile transfer; unexpected Bun churn; an additional missing
runtime dependency exposed by the clean smoke; or any mandatory gate failing
twice.
