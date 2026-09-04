# Plan 185: Restrict Global Task Sort-Key Normalization

> **Executor instructions:** Keep the hourly maintenance job working while
> removing public/manual access to a definer function that rewrites task order
> across every workspace.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tasks packages/tasks-api packages/tasks-ui tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** MEDIUM
- **Category:** security / database / maintenance
- **Depends on:** Plan 154 (BLOCKED); Tasks/database ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

`normalize_task_sort_keys()` is a `SECURITY DEFINER` function that scans every
live task list and rewrites sort keys. It is scheduled through pg_cron, but is
also executable by authenticated clients—and by `PUBLIC` unless explicitly
revoked—so any signed-in actor can trigger a global, expensive ordering rewrite.

## Current state

- `20251015090000_fix_normalize_task_sort_keys_for_timestamp_fields.sql:9-57`
  is the latest body and contains no actor/workspace restriction.
- `20251010032140_add_task_sort_key_normalization_cron.sql:50-62` schedules the
  hourly call and grants authenticated execution.
- Repository-wide search finds no maintained runtime caller; pg_cron is the
  intended execution path.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read root/database AGENTS. Execute from the eventual green
Plan 154 result, which itself is based on completed Plan 151; Plan 163 is not a
dependency because this ACL-only plan must produce zero generated-type drift.
Confirm the live cron owner/role before changing ACLs.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n "normalize_task_sort_keys" apps packages scripts --glob '!apps/database/supabase/migrations/**' --glob '!packages/types/src/supabase.ts'` | no runtime caller |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/task-sort-normalization-privileges.sql` | ACL, cron, and ordering assertions pass |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Types | `git diff --exit-code -- packages/types/src/supabase.ts` | no signature drift |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** one additive ACL/comment migration;
`task-sort-normalization-privileges.sql`; generated types read-only.

**Out of scope:** changing normalization arithmetic/order; replacing pg_cron;
per-list on-demand normalization; task UI/routes; production apply.

## Git workflow

Use `fix/restrict-task-sort-normalization` and commit
`fix(tasks): restrict sort normalization`. Claim/release the commit window; do
not push or apply production migrations.

## Steps

1. Inventory definitions, ACLs, cron job ownership, and callers. Prove no
   supported browser/session client invokes the function.
2. Add a migration revoking all execution from `PUBLIC`, `anon`, and
   `authenticated`. Grant only the exact role required by the existing cron
   owner (normally the function owner/service role); do not alter the body or
   signature.
3. Add pgTAP assertions for ACL denial, preserved function-owner execution,
   exactly one active named cron schedule, and deterministic per-list ordering
   on a small fixture. Prove denied execution changes no task row.
4. Run focused/full disposable DB, no-type-drift, repository, and whitespace gates.

## Done criteria

- [ ] Public/authenticated callers cannot launch global normalization.
- [ ] The existing hourly job still executes as its established owner.
- [ ] Function body/signature and task ordering semantics are unchanged.
- [ ] Focused/full DB, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, a supported runtime caller, unknown cron execution
role, a required body/signature change, type drift, red Plan 154, default-stack
mutation, or a mandatory gate failing twice.
