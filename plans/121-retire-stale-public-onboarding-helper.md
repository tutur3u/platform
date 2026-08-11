# Plan 121: Retire the Stale Public Onboarding Helper

> **Executor instructions:** Verify that no supported external registry
> consumer remains, then remove the obsolete browser-side onboarding helper
> through the governed package-release process. Keep workspace creation and
> provisioning behind the authenticated server contract. If a supported
> consumer exists, STOP and author a separate time-bounded deprecation plan.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/utils/package.json packages/utils/src/onboarding-helper.ts packages/utils/src/__tests__/onboarding-helper.test.ts packages/utils/src/onboarding.ts packages/internal-api/src/onboarding.ts packages/internal-api/src/onboarding.test.ts apps/web/src/app/'[locale]'/'(marketing)'/onboarding apps/docs plugins/tuturuuu scripts/ci/package-release-readiness.test.js tmp/agent-coordination`
> Stop on onboarding ownership, public exports, or release-contract drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** M
- **Risk:** MED
- **Category:** architecture / dependencies
- **Depends on:** connected-onboarding handoff transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The public Utils wildcard exposes an unused, obsolete client API that can create
workspaces without the current server flow's actor verification, workspace
limits, or subscription provisioning. External consumers can discover and rely
on a materially incomplete onboarding contract.

## Current state

- `packages/utils/package.json:58-65` publishes wildcard source subpaths,
  including `@tuturuuu/utils/onboarding-helper`.
- `packages/utils/src/onboarding-helper.ts:34-43,130-213` models the retired
  five-step blocking flow and performs browser-side workspace/default-workspace
  writes. Repository search finds no internal consumer.
- The maintained compatibility action at
  `apps/web/.../onboarding/actions.ts:186-223,285-308` verifies the actor,
  bounds names/workspace counts, and provisions subscription state.
- The connected-onboarding handoff names `packages/utils/src/onboarding.ts` and
  the authenticated progress API as canonical; its status remains `handoff`.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-development-tooling`,
`$tuturuuu-ci-docs`, and `$tuturuuu-agent-coordination`. Obtain explicit scope
transfer from the connected-onboarding owner; no active note currently claims
the Utils helper, manifest, or release-readiness test. Do not query or publish a
package registry without the user's authorization/network approval;
if registry evidence is unavailable, STOP before removal and prepare only the
deprecation plan.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Internal consumers | `rg -n "onboarding-helper" apps packages plugins scripts --glob '!plans/**'` | no supported consumer remains |
| Published artifact | `npm view @tuturuuu/utils version dist-tags --json` | the current registry artifact and supported release line are recorded |
| Public consumers | `gh search code '"@tuturuuu/utils/onboarding-helper"' --limit 100 --json repository,path,url` | no supported public consumer is found; every hit is dispositioned |
| Utils tests | `bun run --cwd packages/utils test -- src/onboarding.test.ts` | canonical flow helpers pass |
| Internal API | `bun run --cwd packages/internal-api test -- src/onboarding.test.ts && bun run --cwd packages/internal-api type-check` | canonical client contract passes |
| Package typecheck | `bun run --cwd packages/utils type-check` | exit 0 |
| Publication tests | `node --test scripts/ci/package-release-readiness.test.js scripts/ci/prepare-npm-package-manifest.test.js` | package governance remains valid |
| Prepared manifest | `utils_pack_dir="$(mktemp -d)"; mkdir "$utils_pack_dir/utils"; cp packages/utils/package.json "$utils_pack_dir/utils/package.json"; node scripts/ci/prepare-npm-package-manifest.js "$utils_pack_dir/utils"` | temporary manifest prepares without worktree mutation |
| Stale contract scan | `rg -n -e 'onboarding-helper' -e 'five-step onboarding' packages/utils apps/docs plugins/tuturuuu` | no obsolete public guidance or source reference remains after removal |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/utils/src/onboarding-helper.ts` and the Utils export/public-package contract
- delete `packages/utils/src/__tests__/onboarding-helper.test.ts` with the
  retired helper
- `packages/internal-api/src/onboarding.test.ts` (create) and canonical Utils
  onboarding tests documenting the replacement boundary
- package release-readiness coverage and the narrow onboarding docs/reference
- `plans/README.md` only for status

Do not redesign connected onboarding, workspace limits, pricing/subscriptions,
personas, UI, or package versions/changelogs. Release Please owns versions.

## Git workflow

Use branch `refactor/retire-onboarding-helper` in an isolated worktree and run
`bun setup`. Because removal of a published subpath is breaking, commit
`refactor(utils)!: remove stale onboarding helper` with a `BREAKING CHANGE:`
body naming the removed import and the canonical Internal API/server
replacement. Release Please—not the executor—owns the resulting major version,
changelog, and publication. Claim the commit window before staging; do not push
or publish unless instructed.

## Steps

### Step 1: Establish the support contract

With explicit network authorization, record the package's current npm artifact
using the command table and search public GitHub code for the exact subpath.
Search repository docs/code locally and ask the package maintainer for the
authoritative internal/private consumer inventory. Npm package download counts
are contextual only and must not be presented as subpath-usage proof. Removal
may proceed only when local and public searches have zero undispositioned hits
and the maintainer records explicit approval in the executor's coordination
note, accepting the residual possibility of undiscoverable private consumers.
If a supported consumer exists or that risk acceptance is unavailable, STOP
and author a separate deprecation/migration plan with an operator-approved
support window; do not mix that alternate outcome into this implementation.

### Step 2: Name the replacement

Document `@tuturuuu/internal-api/onboarding` as the progress read/write client
for supported platform frontends and the authenticated Next/server action as
the only workspace-creation boundary. Do not expose service-role or direct
browser Supabase creation as a replacement public helper.

### Step 3: Remove the unsupported contract

After evidence proves no supported consumer remains, delete
`onboarding-helper.ts` and its focused obsolete test. Add a release-readiness
assertion that the packed package does not expose the subpath, and add the
explicit Internal API onboarding test named in Scope. Do not add a replacement
browser-side workspace mutation helper.

### Step 4: Verify the package contract

Run canonical onboarding tests, package/internal-api typechecks, publication
tests, temporary-copy manifest preparation, the stale-contract scan,
`bun check`, and whitespace. Do not manually bump or publish anything.

## Done criteria

- [ ] Local/public searches have zero undispositioned consumers and explicit
      maintainer approval accepts the residual private-consumer risk; otherwise
      the executor stopped without deleting the subpath.
- [ ] Supported onboarding writes remain behind authenticated server contracts.
- [ ] The packed public contract no longer silently advertises an obsolete helper.
- [ ] Replacement guidance names the canonical Internal API/server boundaries.
- [ ] Package, docs, typecheck, and repository gates pass.

## STOP conditions

Stop if ownership is not transferred, network approval or registry/public-code
evidence is unavailable, the maintainer does not approve the breaking removal,
a supported external consumer lacks a migration window, the named
readiness/docs commands do not exist, or an in-scope gate fails twice.

## Maintenance notes

Public wildcard exports are support commitments. Remove stale client mutation
helpers deliberately through the governed release contract.
