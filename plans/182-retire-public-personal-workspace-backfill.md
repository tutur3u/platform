# Plan 182: Retire the Public Personal-Workspace Backfill RPC

> **Executor instructions:** Remove the one-time global backfill from the
> public API after proving it has no supported caller; do not redesign current
> user-onboarding workspace creation.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts packages/utils/src/onboarding.ts apps/web/src/app/\[locale\]/\(marketing\)/onboarding tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** security / migration / database
- **Depends on:** Plan 154 (BLOCKED), Plan 163 (DONE); database/generated-type and connected-onboarding coordination
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

`create_missing_personal_workspaces()` is a one-time migration helper left as a
public `SECURITY DEFINER` RPC. A public caller can trigger writes for every
missing user and receive user/workspace identifiers plus raw database errors.

## Current state

- `20251104101455_migrate_legacy_roles_to_role_permissions.sql:659-711`
  loops all non-deleted auth users, inserts personal workspaces/memberships,
  returns per-user identifiers and `SQLERRM`, and grants authenticated execute.
- Repository-wide search finds no runtime caller; generated Supabase types
  still advertise the function.
- Maintained connected onboarding uses separate current server-owned contracts;
  those files are evidence only and must not be changed here.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-platform`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Read root/database
AGENTS. Obtain connected-onboarding and generated-type disposition. Search code,
docs, scripts, and external/operator runbooks for supported use before removal.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n "create_missing_personal_workspaces" apps packages scripts plugins --glob '!apps/database/supabase/migrations/**' --glob '!packages/types/src/supabase.ts'` | no supported runtime/tooling caller |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/personal-workspace-backfill-retirement.sql` | function/ACL absence assertions pass |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/personal-workspace-backfill-retirement.sql` | only the retired RPC type disappears |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive migration dropping the zero-argument function;
`personal-workspace-backfill-retirement.sql`; intentional generated-type removal.

**Out of scope:** onboarding behavior; user-creation trigger changes; backfilling
production data; exposing a replacement maintenance endpoint; production apply.

## Git workflow

Use `fix/retire-personal-workspace-backfill` and commit
`fix(auth): retire public workspace backfill`. Claim/release the commit window;
do not push or apply production migrations.

## Steps

1. Prove there is no supported application, script, documentation, or operator
   caller. Obtain maintainer confirmation that this migration backfill is
   complete and not an external contract.
2. Add an additive migration that revokes all function privileges and drops
   the exact zero-argument function. Do not recreate it in `private` unless an
   operator proves an ongoing maintenance need; that discovery is a STOP.
3. Add pgTAP/catalog tests proving no `pg_proc` entry or executable ACL remains
   for anonymous, authenticated, or service-role callers.
4. Generate types from the same disposable stack and verify only the function
   entry is removed. Run full DB, repository, and whitespace gates.

## Done criteria

- [ ] The global backfill is absent from the public database API and generated types.
- [ ] Current onboarding/user-creation behavior is untouched.
- [ ] Focused/full DB, isolated typegen, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, any supported caller, incomplete production backfill,
a request to perform production data repair, generated drift beyond this RPC,
a red Plan 154 baseline, or a gate failing twice.
