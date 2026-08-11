# Plan 100: Make CMS Binding Revocation Atomic and Fail Closed

> **Executor instructions:** Treat the first-class binding, compatibility
> secrets, and audit row as one security-sensitive mutation. A failed disable
> must never leave the prior integration authorized.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/cms/src/lib/external-projects apps/cms/src/app/api/v1/admin/external-project-bindings apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts`
> Stop on CMS binding, external-project authorization, migration, or generated
> type drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** HIGH
- **Category:** security
- **Depends on:** Richfield external-CMS ownership and generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

CMS currently commits compatibility-secret changes, the authoritative binding,
and the audit record as independent requests. A failed disable can report an
error while the previous binding remains enabled, and broad read-error fallback
can authorize newly written compatibility state.

## Current state

- `apps/cms/src/lib/external-projects/admin-store.ts:243-274` deletes and
  optionally recreates legacy secrets before touching the binding table.
- `admin-store.ts:277-305` separately upserts the binding and inserts its audit.
- `access.ts:150-179` treats binding query failures as absence and falls back to
  secrets instead of failing closed.
- `20260614160600_external_project_bindings_table.sql:98-200` contains an
  atomic dual-write precedent, but it derives `auth.uid()` and therefore cannot
  be called through the CMS service-role client without a deliberate actor
  contract.

## Required skills and preflight

Load `$tuturuuu-cms-studio`, `$tuturuuu-database`, and
`$tuturuuu-agent-coordination`. This plan remains blocked while
`20260723-213000-codex-richfield-external-cms.md` or a generated-type owner
claims overlapping paths. Confirm whether compatibility secrets still have a
live consumer before changing dual-write behavior.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| New migration | `bun sb:new make_external_project_binding_atomic` | one additive migration |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | atomicity and privilege cases pass |
| Local apply | `bun sb:up` | migration applies locally |
| Generated types | `bun sb:typegen` | only expected RPC/type changes |
| CMS library tests | `bun run --cwd apps/cms test -- src/lib/external-projects/admin-store.test.ts src/lib/external-projects/access.test.ts` | fault-injection matrix passes |
| CMS route tests | `bun run --cwd apps/cms test -- 'src/app/api/v1/admin/external-project-bindings/[workspaceId]/route.test.ts'` | actor and error mapping passes |
| CMS typecheck | `bun run --cwd apps/cms type-check` | exit 0 |
| CMS build | `bun run --cwd apps/cms build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- CMS external-project admin store/access modules and focused tests
- the existing binding item route test only if response mapping needs coverage
- one additive migration and
  `apps/database/supabase/tests/external-project-binding-atomicity.sql`
- generated database types after local apply
- `plans/README.md` only for status

Do not redesign the CMS studio, canonical project catalog, delivery pipeline,
or external chat settings.

## Git workflow

Use branch `fix/atomic-cms-binding-revocation` in an isolated worktree and run
`bun setup`. Commit `fix(cms): make binding revocation atomic`. Claim the commit
window before staging; do not push unless instructed.

## Steps

### Step 1: Characterize every failure boundary

Add tests for enable, rebind, disable, inactive project, legacy-secret failure,
binding failure, audit failure, binding read error, and absent binding row.
Prove a returned failure preserves the complete previous state.

### Step 2: Introduce one CMS-safe RPC

Create a service-role-only, actor-explicit RPC following the established atomic
function. Revoke execution from `PUBLIC`, `anon`, and `authenticated`; set an
empty search path; validate `p_actor_id` with
`is_root_external_project_admin`; validate the destination and active canonical
project; and mutate compatibility secrets, the first-class binding, and audit
inside one transaction. Return the existing exact JSON keys
`destinationWorkspaceId`, `canonicalId`, and `enabled`. Do not weaken the
existing authenticated RPC.

### Step 3: Make the first-class read authoritative

Query the binding table and throw on every query error. Fall back to legacy
secrets only when the query succeeds with no binding row during the documented
compatibility period; do not catch table, permission, network, or malformed
response errors. Keep a disabled binding row authoritative over stale secrets.

### Step 4: Replace orchestration and verify

Have `updateWorkspaceExternalProjectBinding` call the atomic RPC with the actor
already resolved by the root-admin route. Remove separate writes, run the fault
matrix, apply/typegen, and compile CMS.

## Done criteria

- [ ] Enable, rebind, disable, and audit writes are one transaction.
- [ ] Any mutation failure leaves the previous authorization state unchanged.
- [ ] Binding read errors fail closed; only a successful no-row result may use legacy fallback.
- [ ] RPC execution is service-role-only and validates the supplied actor.
- [ ] Database, CMS, type, build, and repository gates pass.

## STOP conditions

Stop until exact ownership transfers, if a live consumer requires a different
compatibility-secret contract, if historical rows disagree between authorities
without an operator disposition, or if a gate fails twice.

## Maintenance notes

Revocation is complete only when the authoritative read path observes the new
state. Never acknowledge a multi-record security mutation before every record
and its audit commit together.
