# Plan 318: Reconcile Hive Access Across Both Member Stores

> **Executor instructions:** Replace Hive's two opposite-order dual writes with
> one durable, lease-claimed reconciliation state machine. Supabase
> `hive_members` remains the effective satellite gate; the dedicated Hive
> database remains the product/request mirror. Never claim cross-database
> atomicity, and never acknowledge a fully completed mutation until both stores
> match the accepted operation.
>
> **Drift check (run first):**
> `git diff --stat 5af8af5d91..HEAD -- 'apps/hive/src/app/api/v1/hive/access-requests/[requestId]/approve/route.ts' 'apps/hive/src/app/api/v1/hive/access-requests/me/route.ts' 'apps/hive/src/app/api/v1/hive/access-requests/route.test.ts' 'apps/hive/src/app/api/v1/hive/members/route.ts' 'apps/hive/src/app/api/v1/hive/members/route.test.ts' 'apps/hive/src/app/api/cron/hive/access-sync' apps/hive/src/app/api/v1/hive/_shared.ts apps/hive/src/lib/access.ts apps/hive/src/lib/hive/hive-db.ts apps/hive/src/lib/hive/member-sync.ts apps/hive/src/lib/hive/member-sync.test.ts apps/hive/src/lib/hive/types.ts apps/hive/db/migrate-forward.sh apps/hive/db/migrate-forward.test.sh apps/hive/db/migrations packages/internal-api/src/hive.ts packages/internal-api/src/hive/access.ts packages/internal-api/src/hive/access.test.ts apps/docs/platform/applications/hive.mdx tmp/agent-coordination`
> Stop on access-authority, schema, route-envelope, deployment, or active-owner
> drift.

## Status

- **Execution status:** TODO — no active exact-path owner; coordinate the canonical Hive and cron operators before execution
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / tests / architecture
- **Depends on:** none
- **Planned at:** commit `5af8af5d91`, 2026-08-12

## Why this matters

Access-request approval writes Supabase first and the Hive database second,
while direct member administration writes the same stores in the opposite
order. A transient second-store failure therefore grants or revokes access in
only one authority and returns 500 without a durable retry record. The existing
tests cover only the successful approval path and do not define how retries,
response loss, or overlapping changes converge.

## Current state and exact contract

- `access-requests/[requestId]/approve/route.ts:45-67` upserts the Supabase
  satellite gate, then calls `approveHiveAccessRequest`; a second-stage failure
  leaves effective access enabled while the request stays pending.
- `members/route.ts:39-67` upserts the dedicated Hive member first, then the
  Supabase gate; a second-stage failure leaves the product mirror changed while
  effective access did not change.
- `lib/access.ts:5-36` and `_shared.ts:384-453` authorize Hive runtime access
  from Supabase `hive_members` (plus platform admin role). Treat that as the
  effective gate. `access-requests/me/route.ts:15-33` currently derives
  `hasAccess` from the dedicated Hive member instead; change it to the same
  Supabase authority so polling cannot contradict the actual page/API gate.
- `hive-db.ts:215-264` already commits the dedicated member and request approval
  together. Preserve that finalization transaction, but do not execute it until
  the Supabase gate has been confirmed.
- Add forward-only
  `apps/hive/db/migrations/20260812HHMMSS_hive_member_gate_sync_operations.sql`.
  Never edit `apps/hive/db/001_schema.sql`: the Hive runbook defines it as an
  immutable deployed baseline, and fresh installations reach current state by
  applying the forward migration after that baseline. The operation table
  stores: UUID `id`; `user_id`; desired `enabled` and bounded
  `notes`; nullable `access_request_id`/`approved_by`; immutable request hash;
  status `pending|claimed|supabase_applied|completed`; attempt count; lease UUID
  and expiry; sanitized `last_error`; timestamps. Add one partial unique active
  operation per `user_id` for non-completed states.
- Freeze the state machine:
  1. In one Hive transaction, resolve the request/current member, find or create
     the active operation, compare immutable payload, and claim a five-minute
     lease. A same-payload retry resumes it; a different active payload returns
     `409 HIVE_MEMBER_SYNC_IN_PROGRESS` with `Retry-After: 15`.
  2. Perform the idempotent Supabase `hive_members` upsert. On returned or thrown
     failure, release the lease back to `pending`, increment attempts, store only
     a sanitized 500-character error, and return `503 HIVE_MEMBER_SYNC_PENDING`.
  3. Checkpoint `supabase_applied` with the lease token, then finalize the
     dedicated Hive member and optional access-request approval plus
     `completed` operation in one Hive transaction. Lost responses or failed
     checkpoints retry the same idempotent Supabase upsert; they never apply a
     competing operation.
  4. If both stores already match a direct member request and no active operation
     exists, return the current member as completed without creating work. An
     already-approved request whose two stores match replays the stored 200.
- Add `GET /api/cron/hive/access-sync`, authenticated exactly like the existing
  Hive simulation cron, to claim at most 25 due operations in stable
  `(updated_at,id)` order with global concurrency 4. It returns counts only and
  never logs notes or raw database errors. The operator must register it every
  five minutes in the existing managed scheduler before this plan is DONE;
  document the endpoint, credential-name-only setup, retry, and recovery in the
  Hive runbook. Do not add a Vercel cron: Hive is Docker-deployed.
- Additive responses:
  - approval/member mutation: existing `member`/`request` on completed 200;
    pending 503 uses `{ error, code: 'HIVE_MEMBER_SYNC_PENDING', operationId }`;
    active-payload conflict uses the 409 code above;
  - member GET adds `pendingOperations` with IDs, user IDs, desired enabled,
    status, attempts, timestamps, and sanitized error only;
  - access-request status adds `syncStatus: 'idle'|'pending'|'completed'` and
    derives `hasAccess` from Supabase. Preserve every existing field.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-ci-docs`, and `$tuturuuu-commit`; read `apps/hive/DESIGN.md` and the
Hive application runbook. The old Hive migration note is canonically `done` and
is not a lock, but obtain runtime/operator review for the new managed cron. Do
not inspect credential values. Confirm the production Hive forward-migration
runner and scheduler can accept the new migration/endpoint before editing.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Access routes | `bun --cwd apps/hive vitest run 'src/app/api/v1/hive/access-requests/route.test.ts' 'src/app/api/v1/hive/members/route.test.ts' 'src/app/api/v1/hive/access-requests/me/route.test.ts'` | success, both partial-failure orders, replay, conflict, and authority cases pass |
| Reconciler/cron | `bun --cwd apps/hive vitest run src/lib/hive/member-sync.test.ts 'src/app/api/cron/hive/access-sync/route.test.ts'` | lease, checkpoint, retry, concurrency, auth, and redaction cases pass |
| Hive DB migration | `bash apps/hive/db/migrate-forward.test.sh && sh -n apps/hive/db/migrate-forward.sh && node scripts/check-docker-web.js` | the test starts an isolated disposable Postgres, applies the immutable baseline plus all forward migrations, reruns idempotently, verifies the operation schema/indexes, and removes its container/volume; Docker wiring also validates |
| Internal API | `bun --cwd packages/internal-api vitest run src/hive/access.test.ts && bun run --cwd packages/internal-api type-check` | extracted additive response/payload types and client calls pass |
| Hive | `bun run --cwd apps/hive type-check && bun run --cwd apps/hive build` | Hive compiles and builds |
| Repository/docs | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope/size | `git status --short && wc -l apps/hive/src/lib/hive/hive-db.ts apps/hive/src/lib/hive/member-sync.ts 'apps/hive/src/app/api/v1/hive/access-requests/[requestId]/approve/route.ts' 'apps/hive/src/app/api/v1/hive/members/route.ts' packages/internal-api/src/hive.ts packages/internal-api/src/hive/access.ts` | only in-scope files changed; `hive.ts` does not grow, the new access module remains focused, and every substantially edited source stays below 700 lines |

## Scope

**In scope:** Hive approval/member/status routes and focused tests; extracted
member-sync orchestration/types; one Hive forward migration plus fresh-install
and upgrade-path migration tests without baseline edits; bounded authenticated
reconciliation cron; an extracted `packages/internal-api/src/hive/access.ts`
facade with thin compatibility re-exports from the grandfathered 1,382-line
`hive.ts`; focused internal-API tests; Hive operations runbook.

**Out of scope:** changing platform-role admin semantics; moving the effective
access gate away from Supabase; Supabase schema migrations/generated types;
Hive simulation/game data; UI redesign; revoking historical members; live
credential creation, cron registration, deployment, or production migration
application by the executor.

## Git workflow

- Branch: `fix/reconcile-hive-access-stores` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(hive): reconcile member access stores`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging.

## Steps

1. Add failing route tests for both first-store-success/second-store-failure
   windows, commit-then-response-loss replay, same/different overlapping
   payloads, enable/disable, already-matching state, and Supabase-authoritative
   access status. Preserve current auth and validation cases.
2. Add the forward-only operation schema, exact constraints/indexes, row/type
   mappings, and a disposable-Postgres `migrate-forward.test.sh` that proves
   both baseline-plus-upgrade and already-baselined upgrade paths, idempotent
   rerun, and cleanup. Do not edit the immutable baseline. Add tests for claim, expiry-at-five-minutes,
   lease-token CAS, checkpoint, and transactional finalization. Extract all new
   orchestration to `member-sync.ts`; do not grow `hive-db.ts` past 700 lines.
3. Implement one injected Effect-based reconciler with Hive operation storage
   and Supabase gate services. Both mutation routes call it; neither performs
   ad hoc two-store writes. Preserve the existing dedicated-Hive
   member+approval transaction as the final stage.
4. Make `access-requests/me` read effective access from Supabase, expose the
   additive sync status, and make member administration list pending operations
   without exposing notes/errors beyond the frozen fields. Extract the access
   request/member client and additive types to `packages/internal-api/src/hive/access.ts`,
   retain stable thin re-exports from `hive.ts`, and do not add lines to the
   grandfathered oversized file beyond those re-exports.
5. Add the CRON_SECRET-protected bounded cron, fake-service tests, and Hive
   runbook registration/recovery instructions. STOP before marking DONE until
   an operator records the five-minute managed-scheduler registration.
6. Run route/reconciler/internal-api, migration/Docker, Hive build, repository,
   whitespace, exact-scope, and source-size gates.

## Test plan

- Extend the existing access-request suite and create focused member, personal
  status, reconciler, and cron suites using injected fake stores; never connect
  to live databases or email/provider systems.
- Cover failure before claim, after Supabase success, at checkpoint, during
  Hive finalization, and after completed response; expired/live leases;
  overlapping opposite desired states; bounded cron concurrency/order;
  sanitized logs/responses; and later successful convergence.
- Validate the forward migration against an isolated disposable Postgres from
  both the immutable baseline and an already-migrated database. Assert a second
  runner invocation is a no-op and the test always removes its container and
  volume; never modify the baseline to achieve parity.

## Done criteria

- [ ] No access mutation performs two untracked store writes in either order.
- [ ] Every accepted mutation has one durable operation before the first cross-store write and safely resumes after every failure window.
- [ ] Supabase-derived access status agrees with the actual Hive runtime gate while the dedicated mirror converges.
- [ ] Pending/conflicting/completed outcomes are explicit, bounded, observable, and free of sensitive payloads.
- [ ] The five-minute reconciler is operator-registered and all mandatory gates pass.

## STOP conditions

Stop on an active exact-path owner; no approved managed scheduler for the
Docker-deployed Hive app; production schema newer than the forward migrations;
pre-existing contradictory active operations; a requirement to make the
dedicated Hive DB the effective auth gate; inability to preserve existing 200
fields; credential values appearing in output; or a mandatory gate failing
twice.

## Maintenance notes

The operation record is the recovery authority, not proof of distributed
atomicity. Any future Hive access writer must create/resume the same operation
before touching Supabase or the dedicated member/request mirror.
