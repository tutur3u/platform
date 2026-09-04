# Plan 168: Make Topic-Announcement Imports Atomic and Replay-Safe

> **Executor instructions:** Commit contact creation, the import batch,
> announcements, and recipient links in one database transaction. An ambiguous
> retry with the same import request ID must return the original result instead
> of creating another batch.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/import' 'apps/web/src/app/api/v1/workspaces/[wsId]/topic-announcements/import' packages/internal-api/src/topic-announcements.ts packages/internal-api/src/topic-announcements.test.ts 'apps/contacts/src/app/[locale]/[wsId]/users/topic-announcements' apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / transactional import
- **Depends on:** G22 route-artifact and database/generated-type ownership
  transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10; execute from reviewed Plan
  163 commit `3f61e928ea`

## Why this matters

One import can write up to 500 rows through four independent service-role
operations. Failure after any early write leaves contacts, a batch, or draft
announcements committed while the request reports failure; manually retrying
creates another batch because the import has no durable request identity. The
user cannot tell which draft graph is authoritative.

## Current state

- `TopicAnnouncementImportSchema` accepts 1-500 rows.
- The legacy POST independently inserts missing contacts at
  `import/route.ts:100-135`, a batch at `:138-149`, announcements at `:151-175`,
  and recipients at `:177-193`; later errors throw without compensation.
- `20260517152000_add_topic_announcements.sql` has a workspace/lower-email
  uniqueness constraint for active contacts but no request ID or uniqueness
  contract for batches/announcements. Concurrent imports can also race the
  contact read/insert boundary.
- Contacts is the sole reachable workspace-user CRM owner after reviewed Plan
  197 commit `9747845aae`; its import client calls the shared
  `packages/internal-api/src/topic-announcements.ts` helper but does not retain
  a stable request key across an ambiguous retry. The redirected TanStack
  component fork is not a supported caller and must not be extended.
- No focused route test injects failure at the four persistence stages. The
  route is still a legacy implementation behind a generated first-class
  wrapper and is tracked `legacy-next` for the future Rust backend.

## Exact contract

- Request body adds required `requestId: UUID`. Scope uniqueness to
  `(ws_id, actor_user_id, request_id)` so unrelated actors/workspaces cannot
  replay or observe each other's import result.
- The Contacts import surface creates one UUID per submitted import operation,
  retains it across transport failure/manual Retry for that unchanged payload,
  and replaces it only after success or an input change.
- Add `request_id` and `created_by` to batches plus a unique constraint on the
  tuple above. A private service-role-only RPC accepts the normalized rows as
  JSONB and performs active-contact upsert, batch insert, announcement insert,
  and recipient insert in one transaction.
- On an exact replay, return the original batch ID, ordered announcement IDs,
  created-announcement count, original created-contact count, and original row
  errors without writing anything. Same key with a different canonical payload
  hash returns a stable 409 `IMPORT_REQUEST_CONFLICT` without exposing the
  prior payload/result.
- Preserve the existing successful JSON fields and row-error semantics; add no
  new user-facing copy unless the existing generic conflict/import failure copy
  cannot express the stable 409.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$vercel-react-best-practices`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Obtain G22 transfer for
the route override/manifest and database/generated-type transfers. Read the
nearest Web, Contacts, and database AGENTS files. Confirm all reachable callers
use the shared internal-api helper before enforcing `requestId`; treat the
redirected TanStack user component tree as read-only orphaned evidence.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/topic-announcements/import/route.test.ts'` | authorization, atomicity mapping, replay, and conflict cases pass |
| Internal API | `bun --cwd packages/internal-api vitest run src/topic-announcements.test.ts` | request ID/body/status cases pass |
| Contacts UI | `bun --cwd apps/contacts vitest run 'src/app/[locale]/[wsId]/users/topic-announcements/topic-announcements-import.test.tsx'` | stable-key retry/reset cases pass |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/topic-announcement-import-atomicity.sql` | rollback/replay/concurrency cases pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/topic-announcement-import-atomicity.sql` | focused test passes and generated types contain the new RPC/schema only |
| Web route ownership | `bun web:api-routes:check` | exits 0 and does not recreate or modify the removed legacy wrapper/implementation |
| Manifest | `bun migration:tanstack:manifest` | first-class route remains `legacy-next` with updated source ownership |
| Typechecks | `bun run --cwd apps/web type-check && bun run --cwd packages/internal-api type-check && bun run --cwd apps/contacts type-check` | exit 0 |
| Builds | `bun run --cwd apps/web build && bun run --cwd apps/contacts build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** move only the import route from legacy to its first-class Web
path and create its colocated test; the shared internal-api import helper/test;
the Contacts import action/state plus its existing focused tests; the exact
route override/generated manifest; one additive migration,
focused pgTAP, and generated types.

**Out of scope:** sending announcements, changing spreadsheet parsing,
templates, attachments, delivery queues, importing more than 500 rows, adding
a Rust implementation, production migration application, or changing the
existing partial row-validation response.

## Git workflow

Use branch `fix/atomic-topic-announcement-imports` and commit
`fix(contacts): make announcement imports atomic`. Use an isolated worktree,
run `bun setup` immediately, claim/release the commit window, and do not push or
apply production migrations.

## Steps

1. **Inventory callers and freeze the response.** Prove every live caller uses
   the internal-api helper. Move the implementation with `git mv` from legacy
   to the first-class route, preserve the generated wrapper's POST behavior,
   and create a new colocated route test. Add the exact override as
   `legacy-next`/`rust-backend`; Rust has no import POST and must remain
   fallthrough.

   **Verify:** route tests freeze authorization, malformed JSON, invalid rows,
   all-invalid success, successful fields/order, sanitized database failure,
   and the wrapper path no longer imports legacy code;
   `bun web:api-routes:check` exits 0 without regenerating the legacy file.

2. **Add the transactional RPC.** Add request identity/result metadata to the
   batch table and a private RPC with a fixed search path, revoked public/auth
   grants, and service-role-only execution. Canonicalize and validate the JSONB
   shape before mutation. Use one transaction, conflict-safe active-contact
   insertion, deterministic row-number ordering, and an advisory transaction
   lock on the idempotency tuple.

   **Verify:** pgTAP faults each logical stage and proves zero new contacts,
   batches, announcements, or recipients; two concurrent same-key calls produce
   one graph and identical ordered results; different payload/same key is 409;
   cross-actor/workspace same UUIDs are isolated.

3. **Route all persistence through the RPC.** Keep normalization and row-error
   collection in the route, then invoke the RPC once. Delete the four direct
   mutation stages. Map known replay/conflict results exactly; sanitize every
   other database error.

   **Verify:** route tests assert one RPC call, no direct table mutations,
   stable replay JSON, 409 conflict, and no raw database text.

4. **Retain request identity in the reachable client.** Extend the typed helper
   and payload. In Contacts import state, retain one key for the exact submitted
   payload after an ambiguous failure; Retry reuses it. Editing, replacing, or
   clearing rows invalidates the key. Success clears it before a later
   intentional import. Do not update or test the redirected TanStack component
   fork.

   **Verify:** internal-api and Contacts suites cover exact request body,
   unchanged-payload retry, edit reset, success reset, and no automatic retry.

5. **Run all gates.** Run `bun web:api-routes:check`, regenerate the manifest,
   and run focused/full isolated database validation and typegen, typechecks,
   builds, `bun check`, and whitespace verification.

## Done criteria

- [ ] Import persistence is one database transaction with no partial graph on
      any stage failure.
- [ ] Same actor/workspace/request/payload replay returns the original result;
      payload mismatch is a non-disclosing 409.
- [ ] The reachable Contacts client retains the key across ambiguity and resets it only on
      success or input change.
- [ ] The first-class Web route and migration manifest truthfully remain
      `legacy-next`; no Rust ownership is claimed.
- [ ] The Web API route wrapper guard passes without recreating the deleted
      legacy implementation.
- [ ] Focused/full database, route/client, typecheck, build, repository, and
      whitespace gates pass with expected generated-type drift only.

## STOP conditions

Stop on a caller bypassing the shared helper, missing ownership transfer,
inability to preserve the successful JSON contract, existing duplicate batch
identity requiring operator disposition, default-stack mutation, unexpected
generated-type drift, any need to auto-send imported announcements, or a gate
failing twice.

## Maintenance notes

Import idempotency covers creation only. The separate import-and-send action
must continue sending exactly the announcement IDs returned by the import and
must not make delivery part of this database transaction.
