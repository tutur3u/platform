# Plan 174: Use Storage Core as Infrastructure's Single Provider

> **Executor instructions:** Switch the two remaining Infrastructure consumers
> to the already-declared `@tuturuuu/storage-core` export, delete the exact
> byte-identical app-local clone, and preserve behavior. Run every gate.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/infrastructure/src/lib/workspace-storage-provider.ts apps/infrastructure/src/lib/storage-analytics.ts apps/infrastructure/src/lib/workspace-storage-config.ts apps/infrastructure/src/lib/inventory/media-storage-policy.ts apps/infrastructure/src/lib/inventory/media-storage-policy.test.ts apps/infrastructure/src/lib/mobile-deployment/store.ts apps/infrastructure/src/lib/mobile-deployment packages/storage-core/src/lib/workspace-storage-provider.ts packages/storage-core/src/lib/storage-analytics.ts packages/storage-core/src/lib/workspace-storage-config.ts packages/storage-core/src/lib/mobile-deployment/storage-policy.ts packages/storage-core/src/lib/workspace-storage-provider.test.ts apps/infrastructure/package.json packages/storage-core/package.json bun.lock tmp/agent-coordination`
> Package manifests, lockfile, and canonical storage-core source are read-only.
> Stop if hashes, exports, or ownership have drifted.

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** architecture / tech-debt
- **Depends on:** transfer or terminal disposition of the active Inventory
  revenue-bundles handoff for `apps/infrastructure/src/lib/inventory/**`;
  coordinate ordering with blocked Plan 095
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Infrastructure already depends on `@tuturuuu/storage-core` and one live feature
uses its provider, while two other features import a byte-identical 2,029-line
app-local clone. A storage safety or pagination correction can therefore reach
only part of the same app. Converging imports removes duplicate maintenance
without adding a dependency or changing behavior.

## Current state

- `apps/infrastructure/src/lib/workspace-storage-provider.ts` and
  `packages/storage-core/src/lib/workspace-storage-provider.ts` are both 2,029
  lines and have identical SHA-1 `1a598e1fbc3a1d7cbc129b6e29e9267fd5e94239`
  at the planned commit.
- Its relative `mobile-deployment/storage-policy.ts`, `storage-analytics.ts`,
  and `workspace-storage-config.ts` dependencies also match their Storage Core
  counterparts. After the provider deletion, app-local `storage-analytics.ts`
  has no importer and must be removed; the other two remain live through mobile
  deployment and secrets/media callers.
- `packages/storage-core/package.json:2-7` exports
  `./workspace-storage-provider`; `apps/infrastructure/package.json` already
  declares `@tuturuuu/storage-core`.
- `apps/infrastructure/src/lib/ai-agents/external-chat-attachments.ts:3-5`
  already imports the canonical package.
- `mobile-deployment/store.ts:9-12` and
  `inventory/media-storage-policy.ts:1-8` still import the local clone; the
  media policy test mocks that local path.
- Storage Core owns the focused provider suite. The active `handoff` note
  `tmp/agent-coordination/20260703-155820-codex-inventory-revenue-bundles.md`
  broadly owns `apps/infrastructure/src/lib/inventory/**`, including the media
  policy and its test required by this plan. Plan 095 will later modify the
  canonical provider and should inherit this convergence rather than restore
  the clone.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Hash preflight | `shasum apps/infrastructure/src/lib/workspace-storage-provider.ts packages/storage-core/src/lib/workspace-storage-provider.ts apps/infrastructure/src/lib/storage-analytics.ts packages/storage-core/src/lib/storage-analytics.ts apps/infrastructure/src/lib/workspace-storage-config.ts packages/storage-core/src/lib/workspace-storage-config.ts apps/infrastructure/src/lib/mobile-deployment/storage-policy.ts packages/storage-core/src/lib/mobile-deployment/storage-policy.ts` | each app/package pair is identical before editing |
| Import contract | `rg -n "(?:@/lib|\.\.)/workspace-storage-provider" apps/infrastructure/src --glob '*.ts'` | no local-provider imports after change |
| Storage tests | `bun run --cwd packages/storage-core test -- src/lib/workspace-storage-provider.test.ts` | provider suite passes |
| Infrastructure tests | `bun --cwd apps/infrastructure vitest run src/lib/inventory/media-storage-policy.test.ts src/lib/mobile-deployment/storage-policy.test.ts` | focused consumers pass |
| Typechecks | `bun run --cwd packages/storage-core type-check && bun run --cwd apps/infrastructure type-check` | both exit 0 |
| Infrastructure build | `bun run --cwd apps/infrastructure build` | production build exits 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Suggested executor toolkit

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. No dependency command or lockfile edit is expected.

## Scope

**In scope:** delete
`apps/infrastructure/src/lib/workspace-storage-provider.ts` and the newly
orphaned `apps/infrastructure/src/lib/storage-analytics.ts`; update
`apps/infrastructure/src/lib/inventory/media-storage-policy.ts` and its test;
update `apps/infrastructure/src/lib/mobile-deployment/store.ts`; add a focused
import-contract test only if needed; README status.

**Read-only evidence:** canonical storage-core provider/test, both package
manifests, lockfile, external-chat exemplar, other mobile-deployment tests.

**Out of scope:** changing provider behavior or exports; dependency/manifest/
lockfile edits; Drive cursor work from Plan 095; storage rename jobs or
analytics; Inventory/Finance migrations; Web provider copies.

**Execution note:** the first dispatch stopped before worktree creation, setup,
or edits after the ownership preflight found the active handoff above. Resume
only after that exact subtree is transferred or the note reaches a terminal
state.

## Git workflow

Use `refactor/infrastructure-storage-core`, run `bun setup`, and commit
`refactor(infrastructure): use shared storage provider`. Claim/release the
commit window; do not push unless instructed.

## Steps

### Step 1: Prove exact identity and import reachability

Run the hash preflight for the provider and all three relative dependencies,
then search every repository importer of the local file. Confirm only the two
named production consumers and their focused mock resolve to it, while the
package export and existing external-chat import resolve. Confirm app-local
storage analytics is reached only through the provider.

**Verify:** hashes match exactly and no additional local consumer is found. Any
content or importer drift is a STOP.

### Step 2: Switch consumers and mocks to the package export

Replace both local imports with
`@tuturuuu/storage-core/workspace-storage-provider`. Update the media-policy
test mock to the same package path. Keep imported symbol names and all runtime
logic unchanged.

**Verify:** focused Infrastructure tests and both typechecks pass.

### Step 3: Delete the clone and prove the boundary

Delete the app-local provider and its now-unreachable storage-analytics helper.
Retain the still-live local storage config and mobile storage policy. Run the
local-import contract and a repository search for the former provider path. Do
not edit the canonical provider, manifests, or lockfile.

**Verify:** local-import command has no matches; `rg -n 'storage-analytics'
apps/infrastructure/src` has no matches; `git status --short` contains only the
three consumer/test edits, two deletions, and reviewer-owned plan status.

### Step 4: Run final gates

Run the Storage Core provider suite, Infrastructure build, `bun check`, and
whitespace. Confirm `bun.lock` and both manifests are unchanged.

## Done criteria

- [ ] Infrastructure has no app-local workspace-storage-provider or orphaned storage-analytics implementation/import.
- [ ] Both consumers use the existing package export with unchanged symbols/behavior.
- [ ] Canonical provider, manifests, and lockfile have zero diff.
- [ ] Focused tests, typechecks, Infrastructure build, repository, and whitespace pass.

## STOP conditions

Stop if the files are no longer byte-identical, another local consumer exists,
the package export cannot resolve in Infrastructure server code, a dependency or
provider behavior change appears necessary, an active note claims an exact
path, or a mandatory gate fails twice.

## Maintenance notes

Plan 095 and future provider safety work should change only Storage Core after
this lands. A same-name app-local implementation is architectural drift.
