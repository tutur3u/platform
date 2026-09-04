# Plan 065: Remove Track's Unused APIs Dependency

> **Executor instructions:** Remove the unreferenced `@tuturuuu/apis` workspace
> edge from Track using Bun, then prove the satellite still typechecks and builds.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/track/package.json apps/track/src bun.lock`
> Stop if Track begins importing `@tuturuuu/apis` or its manifest/lockfile drifts.

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** Dependencies / Build graph
- **Depends on:** Mail catch-all lockfile ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Track declares a production dependency on the shared server API package without
importing it. That unnecessary edge widens install, invalidation, and ownership
coupling for a satellite whose live shared calls use `@tuturuuu/internal-api`.
The cleanup is small and has a direct source-search and build verification story.

## Current state

- `apps/track/package.json:34` declares `@tuturuuu/apis: workspace:*`.
- `apps/track/package.json:38` separately declares the used
  `@tuturuuu/internal-api` client package.
- `apps/track/src/app/[locale]/(dashboard)/[wsId]/components/use-workspace-tasks.ts:4`
  imports the typed internal API. A full tracked-source search under
  `apps/track` at the planned commit finds no `@tuturuuu/apis` occurrence
  outside `package.json`.
- Root dependency changes use the owning workspace's Bun command; manifests
  must not be hand-edited for dependency removal.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Do not execute
while the Mail catch-all handoff owns `bun.lock`. Run the drift check and
`rg -n "@tuturuuu/apis" apps/track --glob '!package.json'`; any result is a STOP
condition until its runtime/config role is understood.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Remove dependency | `cd apps/track && bun remove @tuturuuu/apis` | manifest and lockfile update without unrelated packages |
| Absence check | `rg -n '@tuturuuu/apis' apps/track` | no output |
| Dependency tests | `node --test scripts/check-workspace-dependencies.test.js` | all cases pass |
| Track typecheck | `bun run --cwd apps/track type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Track build | `bun run --cwd apps/track build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/track/package.json`
- Only the `bun.lock` entries mechanically changed by the owning-workspace
  removal command

Do not remove or update any other dependency, edit Track source, deduplicate
date libraries, refactor timer controls, or regenerate unrelated artifacts.

## Git workflow

- Branch: `chore/track-remove-unused-apis` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `chore(track): remove unused apis dependency`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Re-prove the dependency is unused

Search all tracked Track source/config files, including dynamic imports and
Next configuration. Confirm `@tuturuuu/internal-api` is not being mistaken for
`@tuturuuu/apis`. If the package is referenced outside the manifest, stop.

### Step 2: Remove through the owning workspace

Run the exact Bun removal command. Inspect `git diff -- apps/track/package.json
bun.lock`; accept only removal of the direct Track dependency and the lockfile
edges Bun proves are no longer reachable. Revert nothing else and stop if Bun
rewrites unrelated dependency versions.

### Step 3: Verify the real satellite boundary

Run dependency tests, Track typecheck, repository gate, and the real Track
Next build. The build is mandatory because dependency resolution can succeed in
TypeScript while a Next runtime/config import remains unresolved.

## Test plan

No production test is added for a manifest-only cleanup. The source absence
check is the focused regression assertion; dependency checker, typecheck, and
real build provide the integration proof.

## Done criteria

- [ ] Track no longer declares or imports `@tuturuuu/apis`.
- [ ] The lockfile diff contains only consequences of that removal.
- [ ] Dependency tests, Track typecheck/build, `bun check`, and whitespace pass.
- [ ] No Track source or unrelated manifest is modified.

## STOP conditions

Stop if the Mail lockfile owner has not released/transferred ownership, any
tracked source/config reference exists, Bun changes unrelated versions, another
agent owns the manifest/lockfile, or the real build proves a non-static
framework dependency that the source search missed.

## Maintenance notes

If Track later needs shared server logic, prefer a narrowly exported server-only
core. Browser/API calls continue through `@tuturuuu/internal-api`; do not restore
the broad dependency merely to share response types.
