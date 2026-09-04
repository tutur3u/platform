# Plan 154: Restore a Green Exact-Base pgTAP Baseline

> **Executor instructions:** Repair the five known exact-base database-suite
> failures narrowly so the disposable validator can distinguish new regressions
> from stale catalog assertions and missing baseline migrations.
>
> **Drift check (run first):**
> `git diff --stat 132a9e3ebb..HEAD -- apps/database/supabase/tests apps/database/supabase/migrations apps/database/scripts packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** DX / test infrastructure / database
- **Depends on:** explicit coordination/transfer from
  `20260727-175732-codex-external-ai-usage-policy.md` for the two AI Studio
  suites and `20260703-155820-codex-inventory-revenue-bundles.md` for any
  Inventory migration/test overlap; generated-type transfer only if an approved
  missing schema migration is required; canonical disposition of the top-level
  education-extraction note before editing the Tulearn suite
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from reviewed Plan
  151 commit `132a9e3ebb`

## Why this matters

Plan 151 proved that exact-base migrations can be applied in an isolated stack,
but the mandatory full suite still fails in five unrelated files. Those known
failures prevent reviewed P0 fixes in Plans 086, 145, and 150 from reaching a
commit and transitively block Plan 105.

## Current state

- Plan 150's fresh isolated stack passed its focused 18-assertion policy suite,
  then the full suite failed twice in `ai-studio-credit-observability.sql`,
  `ai-studio-foundations.sql`, `description-table-hardening.sql`,
  `private-schema-workspace-wallets.sql`, and `tulearn-learner-app.sql`.
- The Tulearn failures are demonstrably stale string matching: the test looks
  for `auth.uid() = user_id`, while the applied RLS optimization correctly emits
  `(select auth.uid()) = user_id`.
- The description and wallet suites use broad schema inventories and exact
  function/catalog text, so each failure must be classified rather than waived.
- The two AI Studio suites refer to private RPCs absent from the reviewed exact
  base; ownership must decide whether a missing committed migration or a stale
  test is authoritative.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root and database `AGENTS.md`. Obtain the named exact
coordination transfers; do not treat the completed AI Studio UI note or the
broad Finance/Inventory application note as database ownership. Create an
isolated worktree from `132a9e3ebb`, run
`bun setup`, and use only `sb:validate:isolated`; do not reset or modify the
default developer stack.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Capture baseline | `bun --cwd apps/database sb:validate:isolated` | exactly the known failures are reproduced before edits; logs contain no secret values |
| Tulearn | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/tulearn-learner-app.sql` | semantic policy assertions pass |
| Text hardening | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/description-table-hardening.sql` | current intended table/policy invariant passes |
| Wallets | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/private-schema-workspace-wallets.sql` | schema/function assertions pass semantically |
| AI foundations | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/ai-studio-foundations.sql` | authoritative committed RPC contract passes |
| AI observability | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/ai-studio-credit-observability.sql` | authoritative committed RPC contract passes |
| Full database | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes on a fresh exact-base stack |
| Type drift | `git diff --exit-code -- packages/types/src/supabase.ts` | no type drift unless an approved missing migration is restored |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the five named pgTAP files; only the uniquely identified missing
migration or helper required to restore the already-intended committed schema;
generated types only if that approved migration changes the exposed schema;
focused database-runner tests if a diagnostic defect is discovered.

**Out of scope:** weakening assertions to accept both secure and insecure
states, allowlisting failures, changing product behavior, repairing unrelated
database suites, production apply, default-stack reset, or opportunistic
generated-type churn.

## Git workflow

After transfers, use `fix/restore-exact-base-pgtap` and commit
`fix(database): restore exact-base pgTAP baseline`. Claim/release the commit
window; do not push or apply production migrations.

## Steps

1. Run the full disposable suite once and save only assertion names, SQLSTATEs,
   and file paths. Classify each failure as stale test, missing committed schema,
   or genuine regression. A genuine product regression expands scope only after
   maintainer approval; otherwise STOP with a focused follow-up.
2. Replace Tulearn policy-source substring checks with semantic catalog or
   behavior assertions that accept PostgreSQL's initplan formatting while still
   proving actor ownership and selected-workspace membership.
3. Narrow the description and wallet inventories to the documented invariant,
   preserving real coverage for newly added tables/functions without depending
   on irrelevant pretty-printed SQL.
4. Reconcile the two AI suites with their owning migration lane. Restore only a
   migration that was intended at this base, or update a stale test to the
   committed contract; never invent RPC behavior from the test name.
5. Run every focused file, then one fresh full disposable suite and repository
   gates. Record this green base before resuming Plans 086, 145, or 150.

## Done criteria

- [ ] All five failures are classified with source-backed expected contracts.
- [ ] Focused suites test behavior or stable catalog semantics, not formatting.
- [ ] A fresh full exact-base pgTAP run passes with no allowlist.
- [ ] Default Supabase state and generated types remain unchanged unless
      explicitly required by an approved missing migration.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on ownership, a genuine product regression outside the five named suites,
an ambiguous missing-migration contract, need to reset the default stack,
unexpected generated-type drift, secret-bearing output, or any gate failing
twice.
