# Plan 228: Remove the Private Payment Peer from the Public APIs Package

> **Executor instructions:** Make every published `@tuturuuu/apis` export
> installable from the governed public package graph. Keep member deletion's
> billing cleanup by injecting a host-owned adapter; never silently skip seat or
> orphan-subscription revocation.
>
> **Drift check (run first):**
> `git diff --stat 968bd12018..HEAD -- packages/apis/package.json packages/apis/src/members packages/apis/src/members/route.ts packages/apis/src/members/route.test.ts packages/payment/package.json packages/payment-core apps/web/package.json apps/tasks/package.json 'apps/web/src/legacy-api-routes/workspaces/[wsId]/members/route.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/members/route.ts' 'apps/tasks/src/app/api/workspaces/[wsId]/members/route.ts' apps/web/src/__tests__/workspace-members-delete-route.test.ts 'apps/tasks/src/app/api/workspaces/[wsId]/members/route.test.ts' scripts/ci/package-release-readiness.js scripts/ci/package-release-readiness.test.js scripts/ci/prepare-npm-package-manifest.js scripts/ci/prepare-npm-package-manifest.test.js scripts/ci/release-workflows.test.js .github/workflows/release-apis-package.yaml bun.lock tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Mail owns `bun.lock` and the Pay handoff owns
  `packages/payment-core/**`
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** dependencies / package release / architecture
- **Depends on:** Mail lockfile transfer and Pay exact-path transfer/review
- **Planned at:** commit `968bd12018`, 2026-08-11

## Why this matters

The public `@tuturuuu/apis` tarball advertises a members route that statically
imports `@tuturuuu/payment`, even though that peer is optional, private, and has
no release workflow. Release readiness ignores workspace packages outside the
publishable set, so the governed public release can pass while a documented
export cannot be imported by an external installation.

## Current state and exact contract

- `packages/apis/package.json:33-43` declares optional workspace peer
  `@tuturuuu/payment` and wildcard-exports every route module.
- `packages/apis/src/members/route.ts:1-2,172-175,369-390,420-491` imports the
  private payment SDK at module load for member-seat and orphan-subscription
  revocation.
- `packages/payment/package.json:2-9` is private. The APIs release workflow
  exists; no payment release workflow exists. Manifest preparation rewrites the
  peer to a version, while readiness skips it because it is not publishable.
- Preserve `GET` unchanged. Replace the exported default `DELETE` with an
  explicit `createDeleteMembersHandler({ billing })` factory. Its required
  host adapter must provide best-effort member-seat revocation and orphan-
  subscription revocation; the package owns authorization/data deletion while
  the host owns payment client construction. There must be no no-op/default
  billing adapter.
- Implement the one concrete adapter in
  `@tuturuuu/payment-core/member-billing-adapter`: it owns Polar client
  construction plus the existing seat/subscription helpers and structurally
  satisfies the APIs interface. Keep the interface in APIs so the public
  package does not import payment-core or payment even as a type.
- Migrate all three in-repo route adapters (two Web compatibility routes and
  Tasks). Web already owns payment-core. Add `@tuturuuu/payment-core` to Tasks
  with `bun add`, not a manual manifest edit, and construct the same adapter in
  both hosts. Preserve current best-effort logging/error behavior and response
  envelopes.
- Remove the APIs peer declaration. Add a readiness invariant: every runtime or
  peer `workspace:*` edge of a workflow-published package must itself have a
  release workflow or an explicit, validated vendoring declaration. Private or
  otherwise unpublishable edges fail. Add an installed-tarball smoke that packs
  APIs, installs it without monorepo workspace resolution/private packages, and
  imports `@tuturuuu/apis/members/route`.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-ci-docs`,
`$tuturuuu-development-tooling`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root instructions and release-package tests. Obtain
`bun.lock` transfer from the Mail handoff and exact payment-core transfer from
the Pay handoff; no active note currently owns the exact APIs/member files.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Members contracts | `bun --cwd packages/apis vitest run src/members/route.test.ts && bun --cwd packages/payment-core vitest run src/member-billing-adapter.test.ts && bun --cwd apps/web vitest run src/__tests__/workspace-members-delete-route.test.ts && bun --cwd apps/tasks vitest run 'src/app/api/workspaces/[wsId]/members/route.test.ts'` | auth, concrete billing adapter, deletion, and best-effort semantics pass in both hosts |
| Release contracts | `node --test scripts/ci/package-release-readiness.test.js scripts/ci/prepare-npm-package-manifest.test.js scripts/ci/release-workflows.test.js` | private/unpublished edge fails; governed/vendored edges and APIs artifact pass |
| Artifact smoke | `node scripts/ci/package-release-readiness.js verify-packed-import packages/apis @tuturuuu/apis/members/route` | clean isolated install/import succeeds without private workspace packages |
| Types | `bun run --cwd packages/apis type-check && bun run --cwd packages/payment-core type-check && bun run --cwd apps/web type-check && bun run --cwd apps/tasks type-check` | exit 0 |
| Builds | `bun run --cwd apps/web build && bun run --cwd apps/tasks build` | both production builds exit 0 |
| Plugin/repository | `python3 plugins/tuturuuu/scripts/validate_plugin.py && bun check && git diff --check` | all gates pass |

## Scope

**In scope:** APIs members route/factory/tests and manifest; Web/Tasks member
route adapters/tests; payment-core adapter/tests/export; Tasks payment-core
dependency through Bun; package readiness,
manifest, artifact-smoke scripts/tests; APIs release workflow only if needed to
run the smoke; lockfile; focused CI-tooling reference if the invariant changes.

**Out of scope:** publishing `@tuturuuu/payment` or `payment-core`, changing
Polar provider behavior, member-deletion authorization/data order, other APIs
routes, release versions, registry credentials, or broad package export changes.

## Steps

1. Add red package tests proving `members/route` cannot be imported from a
   clean packed install and readiness currently accepts a published package's
   private/unpublished workspace edge. Characterize Web and Tasks deletion,
   including seat, orphan-subscription, no-subscription, and provider failure.
2. Define the required billing adapter and exported DELETE factory without any
   payment import/type in APIs. Preserve GET and deletion control flow. Make it
   impossible to construct DELETE without the adapter.
3. Implement one concrete adapter in payment-core and compose it in Web and
   Tasks. Use Bun to add the required Tasks workspace dependency; inspect
   lockfile churn. Keep both hosts behaviorally equivalent.
4. Remove the private peer. Harden release readiness and implement the clean
   packed-install import smoke with bounded temporary cleanup and no registry
   credential logging. Wire it into the APIs release gate and recurring script
   tests.
5. Run focused/release/artifact/typecheck/build/plugin/repository/whitespace,
   manifest/lockfile, and exact-scope gates.

## Done criteria

- [ ] A clean consumer can install the governed APIs artifact and import every
      advertised members route export without a private workspace package.
- [ ] Web and Tasks member deletion still attempt seat and orphan-subscription
      cleanup with unchanged authorization, ordering, responses, and best-
      effort behavior.
- [ ] Release readiness fails closed on every undeclared private/unpublished
      runtime or peer workspace edge.
- [ ] Focused/release/artifact/typecheck/build/plugin/repository/whitespace
      gates pass with reviewed manifest/lockfile changes.

## STOP conditions

Stop on unavailable lock ownership, disagreement about billing ownership,
another unaccounted members-route host, need to publish a private payment
package, inability to run a credential-free packed import, semantic deletion
drift, or any mandatory gate failing twice.
