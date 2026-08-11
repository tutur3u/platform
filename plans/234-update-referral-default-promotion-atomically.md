# Plan 234: Update Referral Default Promotions Atomically

> **Executor instructions:** Replace the settings write plus best-effort
> promotion-link migration with one serialized service-role transaction that
> either commits the complete current behavior or changes nothing.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/inventory/src/app/api/v1/workspaces/[wsId]/promotions/referral-settings' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the canonically working Finance/Inventory
  owner and Inventory migration handoff must transfer the exact paths
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / transactional integrity
- **Depends on:** Plans 154 and 163; Finance/Inventory application and Inventory
  migration ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The PUT route ignores the existing-settings lookup error, commits the new
default promotion first, then migrates user links through several independent
writes. Every migration failure is caught and logged while the route returns
HTTP 200. Settings can therefore point at the new promotion while users retain
old links, or a failed old-link deletion can leave both link sets.

## Current state and exact contract

- Preserve the existing body fields, permission, and `200 {message:'success'}`
  envelope. Query/RPC failures return the existing sanitized
  `500 {message:'Failed to update referral settings'}` and never raw SQL text.
  Malformed JSON returns `400 {message:'Invalid request body'}`; schema-invalid
  JSON retains the first Zod issue message.
- `referral_promotion_id` is optional. Omitted means leave its stored value
  unchanged; explicit `null` clears it. Do not collapse those states.
- Preserve the current migration rule exactly: only when old and new IDs are
  both non-null and differ. Find referred users in the route workspace. If any
  of them currently link to the old promotion, migrate exactly that affected
  subset; otherwise link all referred users to the new promotion. Delete old
  links only for the affected subset. Null transitions do not delete links.
- The settings row, new links, old-link deletion, and their triggers must share
  one rollback boundary. Concurrent PUTs for one workspace serialize.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from completed Plan 163 after Plan 154 is green.
Do not start while `20260709-123138-claude-finance-inventory-migration.md` is
`working` or the Inventory revenue-bundles note is `handoff` for migrations.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/inventory vitest run 'src/app/api/v1/workspaces/[wsId]/promotions/referral-settings/route.test.ts'` | GET plus PUT permission/body/omitted/null/change/RPC-failure cases pass |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/referral-settings-transition.sql && bun --cwd apps/database sb:validate:isolated` | exact migration semantics, rollback, serialization, and ACLs pass; full suite green |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/referral-settings-transition.sql` | generated types include the private RPC with no unrelated drift |
| Inventory | `bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** referral-settings route and test; one additive private RPC
migration; one focused pgTAP file; generated DB types. **Out of scope:**
referral assignment/removal functions, promotion CRUD, reward/discount formulas,
UI/messages, changing null-transition link semantics, production apply, or
other workspace settings.

## Steps

1. Expand the route test with red cases for permission denial, invalid JSON,
   omitted versus null promotion, unchanged promotion, changed promotion, and
   trusted-RPC failure. Prove no direct settings/link writes remain after the
   refactor.
2. Create service-role-only
   `private.update_workspace_referral_settings(p_ws_id uuid,
   p_referral_count_cap integer, p_referral_increment_percent numeric,
   p_referral_reward_type referral_reward_type,
   p_referral_promotion_supplied boolean,
   p_referral_promotion_id uuid)` returning `void`. Revoke the exact signature
   from PUBLIC, `anon`, and `authenticated`; grant only `service_role`.
3. In the RPC, lock the workspace row first so a missing settings row is also
   serialized. Lock/read the current settings, validate any supplied non-null
   promotion belongs to `p_ws_id`, and upsert the four settings while preserving
   omission. Apply the exact old-to-new subset/fallback rule above with set-wise
   INSERT/DELETE statements in the same transaction.
4. Add pgTAP for initial insert, unchanged ID, omitted ID, explicit null, old
   subset migration, no-old-link fallback, zero referred users, foreign
   promotion, and function ACLs. Force a post-insert/pre-delete trigger failure
   and prove settings plus new links roll back. Use two credential-free dblink
   workers held behind a setup-row lock to prove two workspace updates overlap,
   serialize, and leave only the winner's coherent state; release/cleanup every
   named connection on exceptions.
5. Replace the route's lookup/upsert/try-catch migration with the typed private
   RPC. Map every RPC error to the sanitized 500; do not return success on a
   partial or unknown result.
6. Run focused/full DB, isolated typegen, Inventory typecheck/build, repository,
   whitespace, and exact-scope gates.

## Done criteria

- [ ] Settings and user-link replacement commit together or not at all.
- [ ] Omitted, null, unchanged, subset, and fallback behavior exactly matches
      the frozen contract.
- [ ] Concurrent updates serialize and no error path returns HTTP 200.
- [ ] The RPC is executable only by `service_role`.
- [ ] Focused/full DB, typegen, Inventory typecheck/build, repository, and
      whitespace gates pass.

## STOP conditions

Stop on a different supported null-transition rule, active exact-path owner,
red Plan 154 baseline, inability to reproduce the old subset/fallback behavior,
need to weaken referral-link triggers, production apply need, or any mandatory
gate failing twice.
