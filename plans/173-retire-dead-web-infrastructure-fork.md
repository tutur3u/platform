# Plan 173: Retire the Dead Web Infrastructure Runtime Fork

> **Executor instructions:** Remove only the unreachable post-cutover Web
> infrastructure graph, preserve Web's still-imported log-drain utility, and point
> documentation/Rust provenance at the live Infrastructure app. Prove
> reachability before deleting anything.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/web/src/lib/infrastructure apps/infrastructure/src/lib apps/infrastructure/src/app/api/v1/infrastructure apps/backend/src apps/docs/platform/architecture/system-design/observability-monitoring.mdx tmp/agent-coordination`
> Infrastructure sources/routes are read-only evidence. Stop on a new live Web
> importer or exact-path ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P2
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** architecture / migration / docs
- **Depends on:** backend/G22 transfer and disposition of active/noncanonical Web infrastructure notes
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Infrastructure hard-cutover left a closed Web library fork totaling roughly
8,754 production lines plus duplicate tests. The live satellite imports its own
copies, but an observability guide and Rust provenance comments still point to
dead Web sources. Maintainers can change a convincing copy that no production
caller reaches while Web continues to typecheck thousands of obsolete lines.

## Current state

- `apps/docs/platform/architecture/satellite-apps.mdx:47-53` establishes local
  Infrastructure API ownership and forbids new Web fallback dependencies.
- Live observability routes under
  `apps/infrastructure/src/app/api/v1/infrastructure/observability/**` import the
  satellite implementation, and the system-design guide names these routes at
  lines 144-148.
- The same guide at lines 172-174 still names
  `apps/web/src/lib/infrastructure/observability.ts` as implementation.
- Rust files including `infrastructure_observability_logs.rs:3-12` and
  `infrastructure_projects.rs:3-12` cite removed Web routes/libraries instead of
  the Infrastructure owner.
- Static importer search shows the Web subtree is closed except
  `log-drain.ts`, which has many live route imports. Web's
  `rate-limit-redis-admin.ts` has only its orphaned Web test; the byte-identical
  Infrastructure copy is the live implementation. Preserve only Web log drain.
- The top-level note `20260629-134624-codex-cron-runner-recovery.md` uses
  noncanonical status `complete` and claims `cron-monitoring.ts`; the
  cron/frontend handoff also records monitoring overlap. Both remain active
  until transferred/archived under repository policy.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Import inventory | `rg -n "@/lib/infrastructure|lib/infrastructure/" apps/web/src --glob '!lib/infrastructure/**' --glob '*.ts' --glob '*.tsx'` | external production imports name only `log-drain` |
| Dead-source absence | `rg -n 'apps/web/src/(app/api/v1/infrastructure|lib/infrastructure/(observability|projects|blue-green-monitoring|cron-monitoring))' apps/docs apps/backend/src --glob '*.mdx' --glob '*.rs'` | no stale provenance matches |
| Web focused | `bun --cwd apps/web vitest run src/lib/infrastructure/log-drain.test.ts` | retained log-drain contract passes |
| Infrastructure | `bun run --cwd apps/infrastructure test` | satellite suite passes |
| Typechecks | `bun run --cwd apps/web type-check && bun run --cwd apps/infrastructure type-check` | both exit 0 |
| Backend | `bun check:backend` | Rust comments/source compile and tests pass |
| Builds | `bun run --cwd apps/web build && bun run --cwd apps/infrastructure build` | both production builds exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Suggested executor toolkit

Load `$tuturuuu-platform`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read
`apps/backend/AGENTS.md` before touching Rust comments.

## Scope

**In scope:** unreachable files/tests under `apps/web/src/lib/infrastructure/**`,
including `rate-limit-redis-admin.ts` and
`apps/web/src/__tests__/rate-limit-redis-admin.test.ts`;
the exact Rust module comments found by the stale-source search;
`apps/docs/platform/architecture/system-design/observability-monitoring.mdx`;
README status.

**Must retain:** `apps/web/src/lib/infrastructure/log-drain.ts` and its test.

**Read-only evidence:** all `apps/infrastructure` sources/routes and satellite
architecture ownership docs.

**Out of scope:** consolidating live log drains (Plan 098); changing Rust or
Infrastructure behavior; route manifests/overrides; database schema; moving
the retained Web log drain; broad observability redesign.

## Git workflow

Use `refactor/retire-web-infrastructure-fork`, run `bun setup`, and commit
`refactor(infrastructure): retire dead Web fork`. Claim/release the commit
window; do not push unless instructed.

## Steps

### Step 1: Prove the closed graph and ownership transfer

Generate a complete list of production and test files in the Web infrastructure
subtree. For every file except the retained log-drain utility, prove all importers
remain inside the deletion set or are stale docs/comments. Search aliases,
relative imports, dynamic imports, test mocks, script strings, and package
exports. Record exact file/line counts before deletion. Obtain transfer or
canonical archival of both monitoring notes and the backend/G22 comments.

**Verify:** the import-inventory command exposes no production consumer of the
deletion set; any unexpected importer is a STOP.

### Step 2: Delete only the unreachable Web graph

Delete the closed implementation and its now-orphaned tests. Explicitly prove
the only Web rate-limit clone importer is its own test and that the
byte-identical Infrastructure implementation is live. Do not reformat or move
the retained log drain. Re-run repository-wide symbol/path searches for every
deleted basename so no dynamic or string-based consumer remains.

**Verify:** Web typecheck and the retained log-drain focused test pass; `git status`
shows only the proven deletion set plus scoped docs/comments.

### Step 3: Correct docs and Rust provenance

Update the observability guide to name the live Infrastructure routes/library.
Change only source-provenance comments in Rust files that cite deleted Web
paths, pointing them to the exact live Infrastructure route/helper. Do not alter
handler status, routing, response parity, or executable Rust code.

**Verify:** stale-source absence command returns no matches and
`bun check:backend` passes.

### Step 4: Run full gates

Run the Infrastructure suite, both typechecks/builds, `bun check`, and
whitespace. Confirm retained Web log drain did not change.

## Done criteria

- [ ] Every deleted Web file had zero importer outside the deletion set.
- [ ] Web `log-drain` remains intact; the dead Web rate-limit clone/test are absent.
- [ ] Docs and Rust provenance identify Infrastructure as source of truth.
- [ ] No runtime/Rust route behavior or migration artifact changed.
- [ ] Focused tests, full Infrastructure tests, backend gate, builds, repository, and whitespace pass.

## STOP conditions

Stop if either ownership note is unresolved, backend/G22 transfer is absent, a
production/dynamic importer reaches a proposed deletion, a supposedly duplicate
file differs materially from the live Infrastructure implementation, deletion
requires changing runtime behavior, or a mandatory gate fails twice.

## Maintenance notes

Do not use this deletion as precedent to remove `log-drain.ts`; that live fork
has many consumers and is separately governed by Plan 098. Rate-limit behavior
remains owned by the live Infrastructure implementation.
