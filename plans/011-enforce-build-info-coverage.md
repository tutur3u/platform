# Plan 011: Enforce Build-Info Coverage for Deployed Next Apps

> **Executor instructions:** Add the two missing no-store endpoints and derive
> coverage from the canonical Vercel target registry. Do not maintain a second
> handwritten app list.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- tuturuuu.ts apps/apps/src/app/api apps/tools/src/app/api packages/utils/src/build-info-route.ts scripts/ci`
> Re-enumerate registered targets and routes after any drift.

## Status

- **Execution status:** TODO
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** Developer Experience / Release observability
- **Depends on:** Plan 004
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

The shared build-info handler exists to answer which commit is actually serving
an app, because successful deployment workflows alone cannot prove live
provenance. The public Apps gateway and Tools app both have preview/production
Vercel targets but lack `/api/build-info`. Operators therefore cannot apply the
fleet's canonical exact-SHA probe to those deployments, and no static check
prevents the next app from repeating the omission.

## Current state

- `packages/utils/src/build-info-route.ts:4-18` documents the endpoint as the
  runtime provenance contract and returns `cache-control: no-store, max-age=0`.
- `tuturuuu.ts:107-117` registers `apps/apps` with preview and production
  workflows.
- `tuturuuu.ts:212-222` registers `apps/tools` likewise.
- Twenty-seven apps already expose
  `src/app/api/build-info/route.ts`; `apps/apps` and `apps/tools` do not.
- Existing routes are two-line adapters:

```ts
import { createBuildInfoHandler } from '@tuturuuu/utils/build-info-route';

export const GET = createBuildInfoHandler('calendar');
```

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-platform`, and `$tuturuuu-agent-coordination`. Confirm no active note
owns either API directory or the chosen validator path.

## Exact scope

- New `apps/apps/src/app/api/build-info/route.ts`
- New `apps/tools/src/app/api/build-info/route.ts`
- New `scripts/ci/check-build-info-coverage.js`
- New `scripts/ci/check-build-info-coverage.test.js`
- `package.json` only if a named check command is required
- Relevant release/deployment docs only if they enumerate provenance endpoints

Do not change build metadata generation, deployment workflows, cache policy,
or `vercelWorkflowTargets` membership.

## Git workflow

- Branch: `fix/build-info-coverage` in an isolated worktree.
- Conventional Commit: `fix(ci): enforce deployed app build info coverage`.
- Do not push/open a PR unless asked. Claim the Git commit window before
  staging/committing; never stage coordination notes.

## Steps

### Step 1: Add the missing route adapters

Create the same thin handler used by existing apps, passing `apps` and `tools`
respectively. Do not add route-segment cache exports; the handler already sets
the response cache contract.

**Verify:** import each route in a focused test, call `GET()`, and assert status
200, the matching app name, and `cache-control: no-store, max-age=0`.

### Step 2: Derive static coverage from deployment data

Create a small checker that loads `vercelWorkflowTargets`, validates each
`appPath`, and asserts that deployed Next apps own
`src/app/api/build-info/route.ts`. Validate the route source uses
`createBuildInfoHandler` with the registry app identity. Produce sorted,
actionable missing/mismatched diagnostics. Keep filesystem and registry inputs
injectable for tests.

Do not hard-code a second target array. If a registry entry is intentionally not
a Next app, encode that as typed metadata in `tuturuuu.ts` rather than an opaque
checker allowlist.

**Verify:** fixture tests cover complete coverage, missing route, mismatched app
identity, missing target root, and deterministic multiple-error output.

### Step 3: Put the invariant in the canonical gate

Expose a named package command if helpful and invoke the checker from the
appropriate validation phase in `scripts/check.js`, or place its hermetic test
under the discovery-backed script suite from Plan 004. Ensure the production
coverage check itself runs, not only fixture unit tests.

**Verify:** temporarily point a fixture target at a missing route and prove the
command exits nonzero; restore it and prove exit 0.

### Step 4: Run focused and repository gates

```bash
node --test scripts/ci/check-build-info-coverage.test.js
node scripts/ci/check-build-info-coverage.js
bun turbo:local run type-check --filter=@tuturuuu/apps --filter=@tuturuuu/tools
bun check
bun --cwd apps/apps run build
bun --cwd apps/tools run build
git diff --check
```

Expected: all commands exit 0, both real app builds compile the new handlers,
and the whitespace check prints nothing. Builds are mandatory for the executor
because this plan adds Next route handlers.

## Done criteria

- [ ] Apps and Tools expose truthful no-store build-info responses.
- [ ] Every registered deployed Next app is checked from one canonical registry.
- [ ] Missing or identity-mismatched route coverage fails with actionable output.
- [ ] Focused tests, typechecks, both app builds, `bun check`, and whitespace pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if a registered target is not a Next app, app identity differs from the
deployment registry for an intentional reason, a route is intercepted by proxy
behavior, or another non-terminal note claims an in-scope path. Reconcile the
canonical data model rather than adding a silent exception.

## Maintenance notes

Any new Vercel target should gain build-info coverage in the same commit. Keep
this endpoint unauthenticated, metadata-only, and uncacheable; never expose
environment variables or credentials.

