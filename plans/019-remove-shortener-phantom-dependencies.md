# Plan 019: Remove Shortener Phantom Dependencies

> **Executor instructions:** Remove only the four dependencies proven unused by
> Shortener, regenerate the lockfile through Bun, and freeze affected-deploy
> behavior with a regression test.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/shortener/package.json apps/shortener bun.lock tuturuuu.ts scripts/ci/check-workflow-config.test.js`
> Repeat the import search before removing anything after drift.

## Status

- **Execution status:** TODO
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** Dependencies / CI efficiency
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

Shortener declares `@tuturuuu/ai`, `@tuturuuu/satellite`,
`@tuturuuu/types`, and `dayjs` without importing them. Vercel affected-path
gating computes transitive workspace dependencies from manifests, so an
AI-only change currently selects Shortener solely through a phantom edge.
Removing the dead dependencies shrinks install/build scope and restores useful
deployment filtering.

## Current state

`apps/shortener/package.json:27-43` declares the four packages. A repository
search under Shortener finds no import; the similarly named required
`@tuturuuu/typescript-config` dev dependency must remain.

`tuturuuu.ts:432-509` builds the transitive workspace dependency closure, and
`getWorkflowDecision` uses it for Vercel gating.
`scripts/ci/check-workflow-config.test.js:243` already tests shared-package
fan-out and is the correct regression location.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-platform`, and
`$tuturuuu-agent-coordination`. Inspect TypeScript, Next/PostCSS config, CSS,
scripts, and dynamic imports before removal; source-import absence alone is not
enough for general dependency cleanup.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Usage proof | `rg -n -e '@tuturuuu/ai' -e '@tuturuuu/satellite' -e '@tuturuuu/types' -e 'dayjs' apps/shortener --glob '!package.json' --glob '!bun.lock'` | no real import/config consumer |
| Remove dependencies | `bun --cwd apps/shortener remove @tuturuuu/ai @tuturuuu/satellite @tuturuuu/types dayjs` | exit 0; manifest and lockfile updated by Bun |
| Focused CI test | `node --test scripts/ci/check-workflow-config.test.js` | exit 0; Shortener regression passes |
| Shortener typecheck | `bun --cwd apps/shortener run type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Shortener build | `bun --cwd apps/shortener run build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/shortener/package.json`
- `bun.lock`
- `scripts/ci/check-workflow-config.test.js`

Do not remove any other dependency, change runtime behavior, alter the Vercel
gating algorithm, or hand-edit dependency versions.

## Git workflow

- Branch: `chore/shortener-dependency-cleanup` in an isolated worktree.
- Conventional Commit: `chore(shortener): remove unused dependencies`.
- Do not push or open a PR unless instructed. Claim the Git commit window before
  staging or committing; never stage coordination notes.

## Steps

### Step 1: Re-prove all four dependencies are unused

Run the usage search and inspect config/CSS/scripts/dynamic imports separately.
Preserve `@tuturuuu/typescript-config`; its name does not imply the runtime
types package is needed.

**Verify:** no consumer exists for any of the four exact packages.

### Step 2: Remove through the owning package manager

Run the exact Bun remove command. The manifest must lose exactly four entries;
lockfile changes must only reflect dependency reachability/metadata caused by
their removal.

**Verify:** `git diff -- apps/shortener/package.json bun.lock` contains no
manual version bumps or unrelated workspace changes.

### Step 3: Freeze the deployment-graph correction

Add a test beside the transitive-dependency cases that loads current workspace
manifests and calls `getWorkflowDecision` for
`vercel-production-shortener.yaml` with only `packages/ai/src/index.ts`
changed. Assert `shouldRun === false`. Retain or add a positive assertion that
a file under `apps/shortener` still selects the workflow.

**Verify:** the focused CI suite exits 0 and the new case fails if the AI edge
is temporarily restored in the test input.

### Step 4: Run all gates

Run the remaining commands. The real Shortener build is mandatory because its
dependency graph changed.

## Done criteria

- [ ] Exactly four proven-unused dependencies are absent from Shortener.
- [ ] Bun regenerated the lockfile without unrelated churn.
- [ ] AI-only changes no longer select Shortener production deployment.
- [ ] Shortener-owned changes still select its deployment.
- [ ] Focused tests, typecheck, `bun check`, build, and whitespace pass.

## STOP conditions

Stop if a removed package has a runtime/config/dynamic consumer, Bun produces
broad unexplained lockfile churn, an active note owns the manifest or lockfile,
or another cause still selects the deployment. Diagnose that cause rather than
weakening the test.

## Maintenance notes

The regression checks behavior, not a hard-coded dependency list. Consider a
repo-wide unused-dependency checker only after measuring Next/CSS/plugin false
positives.
