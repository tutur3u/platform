# Plan 254: Describe the Migration Stack as Validation-Only Until Cutover

> **Executor instructions:** Correct the DevOps overview so it distinguishes
> build/deployment capability from current production authority. Add a focused
> source contract that prevents the overview from claiming TanStack/Rust is
> deployed or serving production before the canonical cutover contract changes.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/docs/build/devops/overview.mdx apps/docs/platform/architecture/tanstack-rust-migration.mdx apps/docs/build/devops/tanstack-rust-local-deploy.mdx scripts/devops-runtime-authority-docs.test.js tmp/agent-coordination`

## Status

- **Execution status:** TODO — no active note owns the DevOps overview or the
  new focused test; coordinate with backend/G22 before changing authority text
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** docs / dx / migration
- **Depends on:** none
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The DevOps landing page says it documents surfaces deployed today and describes
TanStack/Rust as shipping via Docker and Cloudflare. The canonical migration
contract says the Rust backend is not deployed, receives no production traffic,
and Web remains authoritative. Operators can therefore route incident or
release verification toward a runtime that is only future/validation
capability.

## Current state and exact contract

- `apps/docs/build/devops/overview.mdx:7-10` frames its table as deployment
  surfaces that exist today. Lines 20-21 label TanStack/Rust delivery targets
  as sidecars/Workers, and line 44 says they `ship`.
- `apps/docs/platform/architecture/tanstack-rust-migration.mdx:15-24` is the
  canonical authority: backend is not deployed, receives no production
  traffic, Web is live, and Workers are future explicitly approved preview
  capability.
- `apps/docs/build/devops/tanstack-rust-local-deploy.mdx:15-20` repeats that the
  page describes future capability and forbids inferring cutover.
- Rewrite only the overview. The deployment table must label TanStack and Rust
  as local/build-validation or future manual preview targets, not current
  production targets. The principles/recent-change text must say Web remains
  live and no cutover is implied by Docker/Worker/Vercel build capability.
- Add `scripts/devops-runtime-authority-docs.test.js`, discovered by the
  completed root script-test runner. Bound assertions to the DevOps overview:
  require the phrases `apps/web remains the live API runtime` and `not currently
  deployed or used by production`; reject the old statement that the migration
  pair `ship as Docker sidecars and Cloudflare Workers`. Also assert the two
  canonical warning pages still contain their current non-deployed/live-Web
  contract so the test cannot bless contradictory edits.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-ci-docs`,
`$tuturuuu-development-tooling`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root AGENTS and all three cited docs fully. Treat the
canonical warning as authoritative unless an explicitly approved cutover has
landed; a real cutover is a STOP, not permission to guess new wording.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused contract | `node --test scripts/devops-runtime-authority-docs.test.js` | overview and both canonical warnings agree; stale deployed/ship wording is rejected |
| Discovery | `bun test:scripts --list | rg 'scripts/devops-runtime-authority-docs.test.js'` | exactly one discovered test path |
| Docs metadata | `node -e "JSON.parse(require('fs').readFileSync('apps/docs/docs.json','utf8'))"` | exit 0 |
| Full script/repository | `bun test:scripts && bun check && git diff --check` | all tests/checks pass; whitespace output is empty |

## Scope

**In scope:** `apps/docs/build/devops/overview.mdx` and one new root-discovered
test. The canonical migration and local-deploy pages are read/assertion-only.

**Out of scope:** changing actual workflows, Docker/Cloudflare/Vercel
capability, route ownership, manifest/progress counts, deployment/cutover,
backend or TanStack source, docs navigation, secrets, other runbooks.

## Steps

1. Add the focused test and confirm its red phase fails on the current overview
   deployment claims while both canonical warning assertions already pass.
2. Rewrite the table, core principle, and recent-change paragraph to
   distinguish buildable/manual future targets from production authority.
   Preserve links and factual workflow/file references.
3. Run the focused test and discovery gate. Search the overview for `ship as
   Docker sidecars` and any assertion that backend currently serves production;
   expected result is no match.
4. Run JSON parse, full script tests, `bun check`, whitespace, and exact-scope
   gates.

## Done criteria

- [ ] The overview says Web remains live and Rust is not deployed/serving
      production.
- [ ] TanStack/Rust Docker, Worker, and Vercel entries are described as
      validation/future capability, not a completed cutover.
- [ ] The focused test is root-discovered and prevents the contradiction from
      returning.
- [ ] All commands pass and no out-of-scope file changes.

## STOP conditions

Stop if an approved cutover/deployment has landed, the canonical warning pages
no longer match the cited contract, a test-runner change is required, another
owner claims the overview, or any mandatory gate fails twice.

## Maintenance notes

When cutover is explicitly approved and production traffic moves, update the
canonical migration warning, local-deploy warning, overview, and this test in
the same reviewed change. Build capability alone is not delivery evidence.
