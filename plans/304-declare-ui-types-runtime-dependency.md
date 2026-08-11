# Plan 304: Declare UI's Runtime Types Dependency

> **Executor instructions:** Move `@tuturuuu/types` into the public UI package's
> runtime dependencies with Bun and prove the exact finance export from an
> installed tarball. Do not rely on workspace hoisting.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/ui/package.json packages/ui/src/public-runtime-boundary.test.ts scripts/ci/npm-package-artifact-smoke.json scripts/ci/npm-package-artifact-smoke.test.js bun.lock plans/124-put-ui-singleton-runtimes-at-host-boundary.md plans/236-smoke-test-published-npm-tarballs.md tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plans 124/236 overlap the manifest/smoke surfaces and Mail owns `bun.lock`
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** dependencies / public package integrity
- **Depends on:** Plans 124 and 236; UI manifest/smoke and Mail lockfile transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

Public `@tuturuuu/ui` exports finance components whose runtime hook calls
`parseMonthsOwed` from `@tuturuuu/types`, but Types is only a devDependency.
Strict/non-hoisted consumers can fail module resolution while the workspace and
transitive app dependencies conceal the broken artifact contract.

## Current state and exact contract

- `packages/ui/package.json:10-12,425` publishes source subpaths. Its dependency
  block omits Types while devDependencies include `@tuturuuu/types: workspace:*`.
- Reachability is exact:
  `finance/invoices/new-invoice-page` -> `standard-invoice.tsx` -> `hooks.ts`;
  `hooks.ts:20-23,899-906` runtime-imports/calls `parseMonthsOwed` from
  `packages/types/src/primitives/PendingInvoice.ts:23-27`.
- After Plans 124/236 settle their overlapping files, use Bun to remove Types
  from the dev-only field and add exactly `@tuturuuu/types@workspace:*` to
  `dependencies`. It must be absent from devDependencies and peerDependencies;
  this is package-owned executable code, not a host singleton.
- Extend Plan 124's manifest regression to assert the placement. Extend Plan
  236's UI smoke matrix to retain `@tuturuuu/ui/badge` and additionally import
  `@tuturuuu/ui/finance/invoices/new-invoice-page` from the exact installed
  prepared tarball. No Finance source change is required.
- Preserve versions, exports, UI behavior, Release Please metadata, and every
  unrelated lock resolution.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-development-tooling`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain exact transfer
from Plans 124/236 and Mail. Re-run literal/runtime import reachability before
dependency commands. Never hand-edit dependency fields.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Remove dev-only edge | `(cd packages/ui && bun remove @tuturuuu/types)` | Types leaves devDependencies and lock changes stay scoped |
| Add runtime edge | `(cd packages/ui && bun add '@tuturuuu/types@workspace:*')` | Types appears only in dependencies |
| Lockfile | `bun install --lockfile-only` | lockfile reflects only intended manifest placement |
| Manifest | `bun --cwd packages/ui vitest run src/public-runtime-boundary.test.ts` | Types placement plus Plan 124 peers pass |
| Exact tarball | `node scripts/ci/npm-package-artifact-smoke.js --prepare-and-smoke packages/ui` | badge and finance invoice subpath import from clean installed tarball |
| Release tooling | `node --test scripts/ci/npm-package-artifact-smoke.test.js scripts/ci/package-release-readiness.test.js` | matrix and artifact fixtures pass |
| UI | `bun run --cwd packages/ui test && bun run --cwd packages/ui type-check` | UI suite/types pass |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** UI manifest via exact Bun commands; mechanical lockfile change;
Plan 124 manifest test; Plan 236 smoke matrix/test extension.

**Read-only evidence:** finance component/hook chain and Types implementation.

**Out of scope:** UI/Finance source behavior; peer changes; package versions,
exports, release workflows, changelogs, unrelated dependencies or lock updates.

## Steps

1. Re-prove the runtime chain and add red manifest/artifact-smoke assertions.
2. Run the exact remove/add/lock commands after all owners transfer. Inspect each
   diff and stop on unrelated dependency resolution.
3. Add the finance invoice subpath beside the retained badge smoke and prove it
   resolves only through the installed tarball graph.
4. Run manifest, exact tarball, release, UI, repository, whitespace, and exact
   scope gates.

## Done criteria

- [ ] Types exists only in UI dependencies at `workspace:*`.
- [ ] The exact installed tarball imports badge and the finance invoice subpath.
- [ ] No source, export, peer, version, or unrelated lock behavior changes.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on Plan 124/236 or lockfile ownership; no remaining executable Types
runtime import; a registry contract requiring Types to be a peer instead;
unavailable packed dependency; unrelated lock drift; or any mandatory gate
failing twice.

## Maintenance notes

Every executable import in a public source export must be represented in that
package's runtime dependency graph and exercised after packing.
