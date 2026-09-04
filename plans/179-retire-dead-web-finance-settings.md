# Plan 179: Retire the Dead Web Finance-Settings Fork

> **Executor instructions:** Move the only focused test to Finance's canonical
> component, delete the unreachable Web fork, and prove both apps still resolve
> their supported settings surfaces.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/web/src/components/settings/finance apps/web/src/proxy.ts apps/finance/src/components/settings/finance apps/finance/src/components/settings/settings-dialog.tsx apps/finance/package.json apps/web/package.json bun.lock tmp/agent-coordination`
> Manifests, lockfile, proxy, and live Finance production components are
> read-only except for the test relocation/adaptation.

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** architecture / tech debt / test ownership
- **Depends on:** canonical terminal disposition or exact-path transfer from
  the working Finance/Inventory migration note
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Web redirects every Finance workspace route to the Finance satellite, whose
SettingsDialog renders its own components. Web still typechecks 2,850 lines of
unreachable Finance settings and owns the only focused transaction-defaults
test, so fixes can land against a plausible but dead copy. The canonical
Finance component has already diverged by adding Inventory provider mappings.

## Current state

- `apps/web/src/proxy.ts` redirects `/finance` to the Finance satellite.
- Finance's SettingsDialog imports/renders the Finance-local settings.
- Web's twelve-file settings directory has no importer outside itself; its only
  external reachability is the colocated test.
- Ten production component pairs are byte-identical. The canonical Finance
  transaction-defaults component additionally renders
  `InventoryProviderMappingsSettings`.
- The broad Finance/Inventory coordination note remains canonically `working`
  and claims `apps/finance/src/**`, so test relocation requires transfer.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-commit`, and `$vercel-react-best-practices`. Read root/Web/Finance
AGENTS. Resolve the active Finance note before creating a worktree. Re-run the
static importer and hash inventory; stop on any production Web consumer.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Reachability | `rg -n "components/settings/finance|TransactionDefaultsSettings" apps/web/src --glob '!apps/web/src/components/settings/finance/**'` | no Web runtime import of the fork |
| Finance test | `bun --cwd apps/finance vitest run src/components/settings/finance/transaction-defaults-settings.test.tsx` | reconciliation defaults and canonical provider-mapping presence pass |
| Typechecks | `bun run --cwd apps/finance type-check && bun run --cwd apps/web type-check` | exit 0 |
| Finance build | `bun run --cwd apps/finance build` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** relocate/adapt
`transaction-defaults-settings.test.tsx` to Finance; delete all remaining files
under `apps/web/src/components/settings/finance/**`; a focused static
reachability assertion if an established architecture-test home exists.

**Read-only evidence:** Web proxy, Finance SettingsDialog and production
components, both manifests, lockfile.

**Out of scope:** changing Finance settings behavior/copy; routes; translations;
APIs; Inventory provider mapping implementation; dependencies/config; Web
settings outside this directory.

## Git workflow

After transfer, use `refactor/retire-web-finance-settings` and commit
`refactor(finance): retire Web settings fork`. Claim/release the commit window;
do not push.

## Steps

1. Prove the Web tree is unreachable with repository-wide static imports and
   confirm the Finance dialog is the live owner. Hash/diff every pair and record
   the one intentional provider-mapping divergence.
2. `git mv` the focused test into Finance, then adapt only app aliases/mocks
   required by the canonical component. Keep the four reconciliation cases and
   add one assertion/mock proving the Finance-only provider-mapping child is in
   the rendered canonical tree.
3. Delete the other eleven Web files. Re-run reachability/absence checks and
   prove neither app manifest nor lockfile changed.
4. Run the Finance focused test, both typechecks/builds, `bun check`, and
   whitespace. Confirm the final diff is one test relocation/adaptation plus
   eleven deletions and optional established static assertion only.

## Done criteria

- [ ] Web has no Finance-settings implementation or focused test fork.
- [ ] The focused test exercises Finance's live canonical component.
- [ ] Finance provider-mapping divergence is characterized, not removed.
- [ ] Manifests, lockfile, routes, messages, and production behavior are unchanged.
- [ ] Focused test, both typechecks/builds, repository, and whitespace gates pass.

## STOP conditions

Stop on active Finance ownership, any Web production importer, additional
semantic divergence requiring product judgment, test-environment dependency
changes, manifest/lockfile churn, or a mandatory gate failing twice.
