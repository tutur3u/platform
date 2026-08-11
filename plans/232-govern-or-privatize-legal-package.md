# Plan 232: Govern or Privatize the Legal Package

> **Executor instructions:** Obtain an explicit package-ownership decision,
> then make `@tuturuuu/legal` exactly one of two truthful contracts: a governed,
> smoke-tested public release or an explicitly private workspace package.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/legal release-please-config.json .release-please-manifest.json .github/workflows scripts/ci/package-release-readiness.js scripts/ci/package-release-readiness.test.js scripts/ci/release-workflows.test.js tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — product/package owner must choose public or
  private; Pay and Forms owners must transfer release workflow/test paths
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** dependencies / release governance / package contract
- **Depends on:** explicit public-vs-private decision and release-path ownership
  transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

`@tuturuuu/legal` is versioned, non-private, exported, changelogged, and tracked
by Release Please, but no package release workflow includes it. The readiness
gate discovers publishable packages only from those workflows, so Legal can
look public and receive release metadata without any governed artifact—or be
accidentally publishable even if it was intended only for monorepo hosts.

## Current state and exact decision contract

- `packages/legal/package.json` declares version `0.3.0`, no `private: true`, a
  root export, and package tests/typecheck. Web and TanStack consume it.
- Release Please config/manifest/changelog treat it as independently versioned.
  There is no `.github/workflows/release-legal-package.yaml`.
- `package-release-readiness.js` derives the governed package set from release
  workflow files, so it cannot flag this omission.
- Before editing, the owner must record exactly `PUBLIC` or `PRIVATE` in the
  coordination handoff. Registry 200/404 evidence informs the decision but does
  not replace it; never publish or delete a registry artifact during this plan.
- PUBLIC branch: add a Legal workflow matching the simplest current
  TypeScript-package exemplar, include packed root-import smoke/readiness, and
  retain Release Please metadata. PRIVATE branch: set `private: true`, remove
  no historical changelog or Release Please metadata by default, and add no
  release workflow. Removing internal versioning signals requires a separate
  explicit owner decision and follow-up plan.
- In both branches, add a general invariant: every versioned non-private
  workspace package is governed by a package-release workflow or appears in a
  checked temporary allowlist. The initial allowlist is exactly
  `@tuturuuu/games`, `@tuturuuu/masonry`, `@tuturuuu/microsoft`,
  `@tuturuuu/offline`, `@tuturuuu/realtime`, `@tuturuuu/vercel`, and
  `@tuturuuu/workflows`; each entry must carry its existing plan/deferred-ledger
  tracking reference and expiry `2026-10-01`. Tests inject the current date and
  fail expired, missing-rationale, unknown, or duplicate entries. Legal must not
  be allowlisted.

## Required skills and preflight

Load `$tuturuuu-ci-docs`, `$tuturuuu-development-tooling`,
`$tuturuuu-agent-coordination`, `$tuturuuu-commit`, and
`$using-git-worktrees`; read root/package AGENTS and current package-release
workflow exemplars. Do not begin until the nonterminal Pay/Forms owners transfer
the exact release config/workflow/test paths and the decision is recorded.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Registry evidence | `npm view @tuturuuu/legal version --json` | record version on success or explicit public-registry absence; network/auth ambiguity is a STOP |
| Focused readiness | `node --test scripts/ci/package-release-readiness.test.js scripts/ci/release-workflows.test.js` | missing-governance fixture fails red first, then all pass |
| Legal package | `bun run --cwd packages/legal test && bun run --cwd packages/legal type-check` | both exit 0 |
| Plugin/workflows | `python3 plugins/tuturuuu/scripts/validate_plugin.py && bun test:scripts` | plugin and full script suite pass |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**Shared in scope:** Legal manifest and existing package tests/docs if needed;
readiness implementation/tests; release workflow contract tests. **PUBLIC-only:**
new Legal release workflow and packed-import smoke configuration.
**PRIVATE-only:** the Legal manifest's `private: true` contract. **Out of
scope:** deleting or rewriting historical changelog/Release Please metadata,
changing legal document contents, Web/TanStack consumers,
package exports/API, publishing/unpublishing, versions, dependencies/lockfile,
or unrelated package workflows.

## Steps

1. Capture in-repo callers, public registry evidence, and the explicit owner
   decision. STOP if the decision, registry state, and requested branch conflict.
2. Add a red readiness fixture for a versioned non-private package without a
   workflow. Implement deterministic governance discovery and the narrow
   rationale allowlist contract.
3. Execute only the approved PUBLIC or PRIVATE branch described above. For
   PUBLIC, copy/update all workflow package identifiers and test a packed root
   import. For PRIVATE, add only `private: true` and no workflow; preserve the
   changelog and Release Please metadata as internal versioning history.
4. Run focused/full script, Legal, plugin, repository, whitespace, and exact
   branch-specific scope gates. Do not publish.

## Done criteria

- [ ] Legal is either workflow-governed and packed-import tested, or explicitly
      private with no package-release workflow. In the PRIVATE branch, existing
      changelog/Release Please history remains unchanged and any removal is
      deferred to a separately approved follow-up.
- [ ] Readiness rejects any future ungoverned versioned non-private workspace
      package unless a reviewed rationale explicitly covers it.
- [ ] Legal API/content and all current host consumers remain unchanged.
- [ ] Focused/full script, Legal, plugin, repository, and whitespace gates pass.

## STOP conditions

Stop on missing owner decision/transfer, registry/network ambiguity, evidence
of external consumers contradicting PRIVATE, workflow credentials beyond
existing conventions, required dependency/version change, publication action,
or any mandatory gate failing twice.
