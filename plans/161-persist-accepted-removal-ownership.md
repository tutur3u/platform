# Plan 161: Persist Executable Ownership for Accepted Route Removals

> **Executor instructions:** Accepted removal must remain a structured,
> verifiable terminal record. A free-text note must not let a removed Web route
> disappear from migration progress or cutover ownership checks.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- scripts/tanstack-route-overrides.js scripts/tanstack-route-overrides.test.js scripts/tanstack-migration-manifest.js scripts/tanstack-migration-manifest.test.js scripts/tanstack-migration-progress.js scripts/tanstack-cutover-gates.js scripts/tanstack-cutover-gates.test.js apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json README.md apps/docs/platform/architecture/tanstack-rust-migration.mdx apps/docs/platform/architecture/tanstack-rust-migration-plan.mdx tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** MEDIUM
- **Category:** architecture / migration / tooling
- **Depends on:** G22/backend and every active owner of the shared TanStack
  route artifacts; explicit backfill disposition for historical removals
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

An override for a missing route currently needs only a non-empty note and a
generic owner. The generator skips it, so most accepted removals vanish from
the manifest denominator and the cutover gate can report terminal migration
without verifying the replacement route, method, app, or retirement decision.

## Current state

- `scripts/tanstack-route-overrides.js:43-67` validates prose and generic
  `targetOwner`, then `continue`s when an accepted-removal route is absent.
- Pay examples encode their destination only in note text while structured
  ownership is `satellite-app`.
- `scripts/tanstack-cutover-gates.js:300-365` counts only current manifest
  routes and treats migrated plus accepted-removal as terminal.
- Current inventory contains 191 accepted-removal overrides but only 13 such
  manifest records; 178 removal decisions are absent from progress accounting.

## Required skills and preflight

Load `$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`,
`$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and `$tuturuuu-commit`.
Read root AGENTS plus the migration docs. Obtain shared-artifact transfer and
snapshot every historical accepted removal before changing validation.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Override tests | `node --test scripts/tanstack-route-overrides.test.js` | all schema/destination cases pass |
| Manifest tests | `node --test scripts/tanstack-migration-manifest.test.js` | removed records persist deterministically |
| Cutover tests | `node --test scripts/tanstack-cutover-gates.test.js` | unresolved destinations fail closed |
| Regenerate | `bun migration:tanstack:manifest` | deterministic manifest contains live and removed ledgers |
| Root progress | `bun migration:tanstack:readme` | root README badges/table include the removal ledger |
| Progress JSON | `node scripts/tanstack-migration-progress.js --json` | emits authoritative total/migrated/acceptedRemoval/legacyNext counts for both migration docs |
| Docs count contract | `node --test scripts/tanstack-migration-manifest.test.js scripts/tanstack-cutover-gates.test.js` | fixtures assert both docs inventory blocks match authoritative counts |
| Migration check | `bun migration:tanstack:check` | exit 0 |
| Script suite | `bun test:scripts` | all script tests pass |
| Docs JSON, if touched | `python3 -m json.tool apps/docs/docs.json` | valid JSON or no navigation change required |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** override schema/parser/tests; manifest generator/schema/tests;
progress generator/tests; cutover gate/tests; backfill of every accepted-removal
override; regenerated manifest; root generated progress block; focused
`tanstack-rust-migration.mdx` and `tanstack-rust-migration-plan.mdx`
counts/contracts.

**Out of scope:** implementing missing Rust routes, moving product routes,
claiming traffic cutover, changing live route behavior, or accepting unverifiable
external destinations through prose.

## Git workflow

Use `chore/persist-route-removal-ownership` and commit
`chore(migration): persist accepted route removals`. Claim/release the commit
window; do not push.

## Steps

1. Define two structured terminal dispositions: `retired` with rationale and
   replacement absence, or `relocated` with destination app, source file,
   route path, and exact methods. Reject generic owner-only records.
2. Preserve every removal in a deterministic manifest ledger rather than
   skipping missing source routes. Keep ids stable across regeneration.
3. Verify repository-local relocation source files exist and export every
   claimed method. External destinations require a separately approved,
   machine-checkable evidence shape; otherwise STOP.
4. Make progress and cutover gates include the removal ledger and fail when any
   record lacks valid terminal evidence.
5. Backfill all current overrides and regenerate the manifest/root README.
   Read the authoritative `--json` totals, update both migration docs' inventory
   blocks to those exact values, and add a source-backed regression assertion
   so either page fails when counts drift. Do not claim
   `migration:tanstack:readme` updates the docs pages; it updates root README
   only. Run every focused, script, repository, and drift gate.

## Done criteria

- [ ] All 191 accepted-removal decisions are represented in generated output.
- [ ] Relocations prove destination app/file/path/method existence.
- [ ] True retirements are distinct from relocations.
- [ ] Cutover fails for missing, stale, or unverifiable terminal evidence.
- [ ] Regeneration is deterministic and all script/repository gates pass.

## STOP conditions

Stop on ownership, a historical record whose disposition cannot be proven,
need to fabricate external evidence, incompatible artifact consumer, accidental
live route change, or any gate failing twice.
