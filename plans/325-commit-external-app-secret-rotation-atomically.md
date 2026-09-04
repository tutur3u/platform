# Plan 325: Commit External-App Secret Rotation Atomically

> **Executor instructions:** Replace delete-then-insert registry field updates
> with one locked service-role transaction whose returned rows are sufficient to
> build the response. Preserve one-time plaintext delivery and explicitly avoid
> claiming HTTP/database atomicity across a lost response.
>
> **Drift check (run first):**
> `git diff --stat b68f9f182d..HEAD -- 'apps/infrastructure/src/app/api/v1/infrastructure/external-apps/[appId]/secrets/route.ts' apps/infrastructure/src/app/api/v1/infrastructure/external-apps/route.ts apps/infrastructure/src/lib/app-coordination/external-apps.ts apps/infrastructure/src/lib/app-coordination/external-apps.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`
> Stop on registry storage, credential format, route envelope, or database/type
> ownership drift.

## Status

- **Execution status:** BLOCKED — Plan 154 green and database/generated-type transfer
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / security / tests
- **Depends on:** Plan 154 green, completed Plan 163, database/generated-type ownership transfer
- **Planned at:** commit `b68f9f182d`, 2026-08-12

## Why this matters

External-app field replacement currently commits deletion before insertion.
Rotation can invalidate the old credential and then fail to install the new
one; even successful insertion performs another fallible read before returning
the caller's only plaintext copy. The same helper can partially rewrite general
registry updates.

## Current state and exact contract

- `apps/infrastructure/src/lib/app-coordination/external-apps.ts:142-179`
  deletes selected `workspace_secrets` rows, then inserts replacements in a
  second transaction.
- `rotateExternalAppSecret` at lines 308-347 generates plaintext, replaces
  hash/metadata, then calls `getExternalAppById`; a read failure occurs after
  the new hash has committed. `upsertExternalApp` at 249-306 uses the same
  partial replacement helper.
- The rotation route at
  `apps/infrastructure/src/app/api/v1/infrastructure/external-apps/[appId]/secrets/route.ts:12-37`
  maps every service error to generic 400; existing focused coverage tests only
  access permission selection.
- Add `private.replace_external_app_fields(p_app_id text, p_fields jsonb,
  p_require_existing boolean default false)` as a SECURITY DEFINER RPC.
  Validate normalized app ID, a nonempty object, exact
  allowed `ExternalAppSecretField` keys, string values and current field-size
  limits; reject unknown/null/non-string keys. Lock an advisory key derived from
  the app ID, delete only named root-workspace rows, insert replacements, and
  return the complete current field set for that app in the same transaction.
- Under the lock, require at least one existing app-prefixed field only when
  `p_require_existing` is true. General upsert passes false; rotation passes
  true. Use fully qualified names/fixed safe search_path. Revoke from PUBLIC,
  anon, authenticated; grant service_role only. Typed P0001 codes are exactly
  `EXTERNAL_APP_INVALID` and `EXTERNAL_APP_NOT_FOUND`; unexpected errors remain
  sanitized 500.
- Application code must call the RPC once and build `app` from its returned
  rows; remove the post-write `getExternalAppById`. Preserve app ID/secret
  format, hashing, last-four display, timestamps, actor metadata, success JSON,
  and the one-time plaintext response. A commit followed by transport loss is
  inherently ambiguous: retrying rotation issues a new secret that supersedes
  the unknown one. Document/test that recovery; never persist plaintext or
  promise that every committed credential reaches the client.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/external-app-registry-fields.sql --typegen packages/types/src/supabase.ts` | rollback, locking, ACL, validation, return-row, and concurrency cases pass |
| Typegen stability | `cp packages/types/src/supabase.ts /tmp/plan325-supabase.ts && bun --cwd apps/database sb:validate:isolated --test supabase/tests/external-app-registry-fields.sql --typegen packages/types/src/supabase.ts && cmp /tmp/plan325-supabase.ts packages/types/src/supabase.ts` | second generation is byte-identical |
| Service | `bun --cwd apps/infrastructure vitest run src/lib/app-coordination/external-apps.test.ts 'src/app/api/v1/infrastructure/external-apps/[appId]/secrets/route.test.ts'` | failure matrix and exact one-time success pass |
| Infrastructure | `bun --cwd apps/infrastructure run type-check && bun --cwd apps/infrastructure run build` | typecheck and app build pass |
| No partial helper | `rg -n 'replaceExternalAppFields|getExternalAppById\(id, sbAdmin\)' apps/infrastructure/src/lib/app-coordination/external-apps.ts` | old delete/insert helper and post-rotation read are absent |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only in-scope paths and plan status changed |

## Scope

**In scope:** one additive private RPC migration and focused pgTAP file;
generated types; registry service and focused tests; rotation route/test; the
general registry route only if typed error mapping needs parity.

**Out of scope:** changing credential/token format, storing plaintext, external
app auth verification, registry permissions/UI, moving registry fields to a new
table, automatic consumer rollout, or guaranteeing delivery after network loss.

## Git workflow

- Branch: `fix/atomic-external-app-secret-rotation` in an isolated worktree;
  run `bun setup` immediately.
- Create the migration with `bun sb:new replace_external_app_fields_atomically`.
- Commit: `fix(infrastructure): commit app secret rotation atomically`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

1. Add pgTAP red cases for invalid IDs/payloads/keys/values, direct ACLs,
   required-existing true/false, delete/insert fault rollback, exact complete
   returned rows, disjoint fields, and concurrent replacements for one app.
2. Implement the locked, allowlisted service-role RPC in one additive migration;
   run isolated validation and deterministic typegen.
3. Add service tests for missing app, RPC failure, successful upsert/rotation,
   no second read, exact require-existing flags,
   hash/last-four/timestamps/actor fields, and a simulated response-loss retry
   whose second returned credential becomes authoritative.
4. Replace the helper with one RPC call for both upsert and rotation. Build the
   response from returned rows and map expected route errors distinctly (404
   missing, 400 invalid, sanitized 500 unexpected) without logging
   credential material.
5. Run every database, test, app, repository, scope, and whitespace gate.

## Done criteria

- [ ] No external-app field replacement can commit deletion without all named
  replacement rows or expose partial concurrent state.
- [ ] Rotation performs no fallible database read after its committed RPC
  response and returns plaintext only on confirmed success.
- [ ] Plaintext is never persisted/logged; ambiguous transport retry semantics
  are tested and documented without overclaiming delivery.
- [ ] pgTAP, deterministic typegen, service/route tests, Infrastructure build,
  `bun check`, scope, and whitespace gates pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if an external consumer depends on partial field deletion, field values
exceed the frozen database limit, workspace_secrets ownership/schema changes,
the RPC cannot return complete rows without exposing unrelated secrets, or the
database/type lanes have not transferred.

## Maintenance notes

All future registry field writers must use this RPC. A durable acknowledgeable
plaintext-delivery protocol would require a separately reviewed encrypted
operation store; do not smuggle plaintext persistence into this plan.
