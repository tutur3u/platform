# Plan 249: Bound and Resume Inventory-to-Polar Drift Repair

> **Executor instructions:** Replace the full-history, fully serial Inventory
> product reconciliation with a durable bounded job. Manual resync must enqueue
> and report progress; the cron must claim a fixed amount of work, checkpoint
> every page, and resume without duplicating Polar products.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/inventory/src/app/api/cron/inventory/polar-product-sync' 'apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/polar-product-sync' apps/inventory/src/components/operator/polar-sync-health-panel.tsx apps/inventory/messages/en.json apps/inventory/messages/vi.json packages/inventory-core/src/lib/inventory/commerce/auto-listing.ts packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-reconcile.ts packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-reconcile.test.ts packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-core.ts packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-core.test.ts packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-webhooks.ts packages/inventory-core/src/lib/inventory/commerce/repository-listings.ts packages/inventory-core/src/lib/inventory/commerce/repository-listings.test.ts packages/inventory-core/src/lib/inventory/commerce/repository.ts packages/internal-api/src/inventory.ts packages/internal-api/src/inventory.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the canonically `working`
  Finance/Inventory migration note owns `apps/inventory/src/**` and
  `packages/inventory-core/**`; the Inventory revenue-bundles `handoff` owns
  adjacent Polar/database paths. Plans 154/163 and exact-path transfers are
  required.
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** performance / correctness / test coverage
- **Depends on:** Plans 154 and 163; Finance/Inventory, Polar, database/type,
  and internal-api ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The daily cron loads every configured workspace and waits for each workspace
serially. Each workspace then loads every listing, variant, and bundle and
awaits one provider operation per row; the manual button additionally runs an
unbounded N+1 listing backfill in the HTTP request. Database row caps can omit
later catalog rows, while provider latency makes both cron and interactive
requests grow with total retained catalog size. Existing tests exercise only a
pure summary formatter, so paging, partial failure, retries, and duplicate
prevention can regress unnoticed.

## Current state and dedupe evidence

- `apps/inventory/src/app/api/cron/inventory/polar-product-sync/route.ts:36-72`
  reads every integration without order/range, deduplicates in memory, and
  serially awaits `reconcileWorkspacePolarProducts` for every workspace.
- `packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-reconcile.ts:28-154`
  performs three unpaged reads and three serial provider loops. It does not
  inspect those read errors, so a failed/capped query can look like a completed
  reconciliation.
- `packages/inventory-core/src/lib/inventory/commerce/auto-listing.ts:105-154`
  reads every workspace product and listing, performs one stock lookup per
  missing product, and serially creates listings.
- `apps/inventory/src/app/api/v1/workspaces/[wsId]/inventory/polar-product-sync/route.ts:46-75`
  runs both operations before responding. The typed client and
  `polar-sync-health-panel.tsx:39-54` expect immediate numeric completion.
- `polar-product-sync-reconcile.test.ts:1-68` tests only
  `buildPolarProductSyncSummary`; there is no cron/manual orchestration suite.
- The prepared Rust handler is GET-only and intentionally falls through for
  POST. Keep that split and the existing summary GET unchanged.
- This is not Plan 135, which only bounds the sync-health read response, and is
  not the deferred Pay catalog cron item. No indexed/deferred item owns the
  Inventory-to-Polar push reconciliation state machine.

## Exact durable job and API contract

- Add `private.inventory_polar_sync_jobs`, one row per `ws_id`, with:
  `id uuid primary key`, `ws_id uuid not null unique`, `status` in
  `queued|processing|completed|failed`, `phase` in
  `backfill|listings|variants|bundles`, nullable `(cursor_created_at, cursor_id)`,
  `available_at`, `claimed_at`, `lease_expires_at`, `completed_at`,
  `requested_by`, `attempt_count`, `listed_count`, `listing_count`,
  `variant_count`, `bundle_count`, `last_error`, and timestamps. Use a stable
  `(created_at ASC, id ASC)` page order; verify each source table has or receives
  the matching workspace/status/order index.
- Add `private.inventory_polar_sync_operations` with `id uuid primary key`,
  `job_id`, `ws_id`, `environment`, `kind`, `row_id`, `status` in
  `dispatching|synced|rejected|ambiguous|duplicate`, nullable
  `polar_product_id`, `started_at`, `settled_at`, `last_error`, and timestamps;
  enforce `unique (environment, kind, row_id)`. This is the durable provider-
  dispatch identity and must not be cleared by job retry or manual reset.
- Seed one queued job for every distinct existing Polar-integration workspace.
  A definer trigger on integration INSERT creates the workspace job if absent.
  Completion leaves the row visibly `completed` with
  `available_at = now() + interval '24 hours'`; when that instant is due, the
  claim RPC may atomically reset it to `processing/backfill` with cleared
  cursors, counters, error, and attempts. This reuses one row without hiding the
  terminal result from manual polling or creating unbounded history.
- Add service-role-only RPCs with exact names:
  `private.request_inventory_polar_sync(p_ws_id uuid, p_actor_user_id uuid)
  returns private.inventory_polar_sync_jobs`,
  `private.claim_inventory_polar_sync_jobs(p_limit integer, p_lease_seconds integer)
  returns setof private.inventory_polar_sync_jobs`, and
  `private.checkpoint_inventory_polar_sync_job(p_job_id uuid,
  p_claimed_at timestamptz, p_outcome text, p_next_phase text,
  p_cursor_created_at timestamptz, p_cursor_id uuid, p_listed_delta integer,
  p_listing_delta integer, p_variant_delta integer, p_bundle_delta integer,
  p_error_code text) returns private.inventory_polar_sync_jobs`.
  `p_outcome` is exactly `continue|complete|retry|fail`; cursor fields must both
  be null or both non-null, deltas are nonnegative and default-free, and
  `p_error_code` is null except for `retry|fail`. `continue` advances the
  cursor or phase and immediately requeues; `complete` sets visible terminal
  status `completed`, clears the cursor, and schedules the next daily claim;
  `retry` preserves phase/cursor and applies the reviewed delay; `fail`
  preserves them and becomes terminal. Revoke all exact
  signatures from PUBLIC, `anon`, and `authenticated`; grant only
  `service_role`.
- Add service-role-only operation RPCs
  `private.claim_inventory_polar_sync_operation(p_job_id uuid, p_ws_id uuid,
  p_environment text, p_kind text, p_row_id uuid) returns
  private.inventory_polar_sync_operations` and
  `private.settle_inventory_polar_sync_operation(p_operation_id uuid,
  p_started_at timestamptz, p_outcome text, p_polar_product_id text,
  p_error_code text) returns private.inventory_polar_sync_operations`.
  `p_outcome` is exactly `synced|rejected|ambiguous|duplicate`; settling
  compare-and-sets the original `started_at`. Apply the same exact-signature
  revokes/grant and pgTAP ACL checks as the job RPCs.
- `request_inventory_polar_sync` is idempotent while queued/processing: return
  that row without resetting its cursor. A completed/failed row is reset to
  queued/backfill only after the caller's current Inventory authorization has
  succeeded in the route. A lease is exactly 10 minutes. Expired processing
  work increments `attempt_count`, resumes from the stored phase/cursor, and
  never rewinds completed pages. Five failed attempts make the job terminal
  `failed` until a permitted manual request resets it.
- Each worker invocation claims at most `4` jobs. Each claimed job processes at
  most `25` source rows from its current phase, with at most `4` provider
  operations globally in flight. Metadata list/get, create, update, and archive
  calls all consume that same pool. It checkpoints counts and the last
  successful cursor only after every row in that page settles successfully. A
  provider or database failure records a sanitized error when persistence is
  available, releases the job with exponential delays `1, 5, 30, 120` minutes,
  and returns failed cron health when any claimed page fails.
- The backfill phase must use one set-based, workspace-bound page of products
  lacking a non-archived listing plus one bounded stock projection; do not load
  all IDs or run one stock query per product. Every backfill listing creation
  that calls Polar consumes a slot from the same global four-operation pool.
  Listing creation and every later Polar push must use the durable operation
  identity and metadata adoption boundary below.
- Preserve `pushRowToPolar(...)` and the `schedule*PolarSync(...)` helpers as
  best-effort/non-throwing for ordinary Inventory writes. Extract their shared
  implementation behind a new exact worker seam
  `pushRowToPolarForReconciliation(table: SyncTable, kind: SyncKind,
  row: PolarSyncRow): Promise<PolarReconciliationResult>`, where the result is
  the closed union `{ ok: true; state: 'synced' | 'disabled' } |
  { ok: false; code: 'provider_rejected' | 'delivery_ambiguous' |
  'state_write_failed' | 'duplicate_provider_identity' }`. It must await
  provider dispatch and the final sync-state write, return only sanitized codes,
  and never claim that a failed state write recorded its own error.
- Add the parallel exact worker seam
  `archiveRowInPolarForReconciliation(table: SyncTable, rowId: string,
  wsId: string, storefrontSlug: string | null):
  Promise<PolarReconciliationResult>` over the same internal implementation;
  keep existing `archiveRowInPolar` best-effort/non-throwing.
- Add
  `createStorefrontListingForReconciliation(wsId, storefrontId, payload):
  Promise<{ listing: InventoryStorefrontListing; polar:
  PolarReconciliationResult }>` in the repository boundary. Factor the shared
  database creation logic so this worker-only function suppresses the detached
  `scheduleListingPolarSync`/archive call, then awaits exactly one matching
  worker push/archive result. The existing `createStorefrontListing` signature
  and detached best-effort semantics remain unchanged. Backfill uses only the
  worker-specific function, so every provider operation is observable and
  counted once.
- Before every create whose Inventory row has no `polar_product_id`, query
  Polar with exact metadata `{ environment, kind, rowId, wsId }` and `limit: 2`.
  A lookup failure performs no create. One match is adopted and updated through
  the existing path; two matches settle `duplicate` and perform no provider
  mutation. With zero matches, only a newly inserted or explicitly `rejected`
  operation claim may dispatch create. A prior `dispatching` or `ambiguous`
  operation is lookup-only forever: it may adopt a later visible single match,
  but it must never create again automatically.
- Immediately before create, persist the operation claim; immediately after a
  successful provider response, settle it with the returned product ID before
  updating the Inventory row. A documented deterministic provider rejection
  settles `rejected` and may be reclaimed on the next job attempt. Timeout,
  connection loss, response-parse failure, or operation-settlement failure is
  `ambiguous`: the job becomes terminal failed with closed error
  `provider_delivery_ambiguous`, and manual retry performs metadata lookup/adopt
  only. If operation settlement succeeded but the later Inventory row write
  failed, return `state_write_failed`; retry adopts the operation's stored
  product ID and repeats only the Inventory state write. This favors a visible
  unresolved row over creating a duplicate.
- `POST /api/v1/workspaces/:wsId/inventory/polar-product-sync` returns HTTP 202
  `{ jobId: string, status: 'queued' | 'processing' }`; it no longer performs
  catalog work in the request. Authentication/permission and sanitized error
  statuses remain unchanged.
- Add `GET .../polar-product-sync/jobs/:jobId`, authorized with the same
  workspace view boundary, returning exactly `{jobId,status,phase,processed,
  attempts,lastError,updatedAt}` where `processed` contains the four counters
  and `lastError` is a closed sanitized message or null. Foreign jobs return
  404. Add matching typed internal-api functions.
- The panel shows a localized queued/in-progress state, polls the bounded job
  detail while nonterminal, invalidates the existing summary on completion,
  and shows a retryable localized failure without claiming rows were synced
  synchronously.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`,
`$vercel-react-best-practices`, and `$tuturuuu-commit`. Read root and any nearer
AGENTS files. Use `@tuturuuu/utils/effect` for the bounded worker if its typed
retry/concurrency services fit without changing the public API. Execute from
completed Plan 163 only after Plan 154 is green and every owner named in Status
transfers the exact paths.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n 'reconcileWorkspacePolarProducts|backfillProductListings|syncInventoryPolarProducts|polar-product-sync' apps packages --glob '!plans/**'` | every cron/manual/UI/Rust caller is classified; Rust remains GET-only |
| Core and routes | `bun --cwd packages/inventory-core vitest run src/lib/inventory/commerce/polar-product-sync-core.test.ts src/lib/inventory/commerce/repository-listings.test.ts src/lib/inventory/commerce/polar-product-sync-reconcile.test.ts src/lib/inventory/commerce/auto-listing.test.ts && bun --cwd apps/inventory vitest run 'src/app/api/cron/inventory/polar-product-sync/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/inventory/polar-product-sync/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/inventory/polar-product-sync/jobs/[jobId]/route.test.ts' src/components/operator/polar-sync-health-panel.test.tsx` | awaited provider-result, ordinary detached-write, bounds, enqueue, lease, retry, resume, UI polling, and auth cases pass |
| Typed client | `bun --cwd packages/internal-api vitest run src/inventory.test.ts` | exact 202/job-detail requests and envelopes pass |
| Database focused/full | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/inventory-polar-sync-jobs.sql && bun --cwd apps/database sb:validate:isolated` | job/operation claims, leases, checkpoints, unique identities, ACLs, seeding, retry, and full baseline pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/inventory-polar-sync-jobs.sql` | job/RPC types are current with no unrelated drift |
| Types/build | `bun run --cwd packages/inventory-core type-check && bun run --cwd packages/internal-api type-check && bun run --cwd apps/inventory type-check && bun run --cwd apps/inventory build` | all exit 0 |
| Messages/repository | `bun i18n:sort && bun check && git diff --check` | bilingual catalogs sorted; all gates pass; whitespace output empty |

## Scope

**In scope:** the Inventory cron and focused test; manual sync collection route
and test; new job-detail route/test; Polar panel/test and only required English/
Vietnamese messages; internal-api Inventory types/functions/tests; bounded
backfill/reconcile modules/tests; the Polar sync core and focused test; listing
repository implementation/re-export/test; the scheduling module only to share
the internal dispatch primitive while preserving its public behavior; one
additive job/operation/RPC/index migration and pgTAP; generated database types.

**Out of scope:** Polar webhook/order/checkout handling; changing ordinary
Inventory write scheduling or its best-effort behavior; changing product price,
status, environment, or provider identity semantics; sync-health GET/Rust
response changes; provider SDK replacement; broad Infrastructure's local
Inventory fork; production migration apply; unrelated Inventory UI; changing
daily cadence, page size, concurrency, lease, or retry numbers without a new
reviewed plan.

## Steps

1. Freeze red tests for the 202/job-detail contract, permission/foreign-job
   denial, claim size, page size, global concurrency, query failure, later-page
   provider failure, post-create state-write failure, metadata adoption,
   duplicate metadata matches, ambiguous no-recreate, lease expiry, retry
   schedule, terminal failure, and UI queued/completed/failed states.
2. Add the job and unique provider-operation tables, supporting indexes,
   existing-integration seed, insert trigger, exact RPCs, signature-specific
   ACLs, and pgTAP. Use
   `FOR UPDATE SKIP LOCKED` in claims and compare the lease/cursor in every
   checkpoint so a stale worker cannot settle a newer claim.
3. First extract and characterize the exact awaited worker provider/listing
   seams while preserving ordinary detached writers. Replace full backfill
   queries with the exact set-based 25-row page. Refactor reconciliation to
   process one phase/page with injected awaited provider dispatch and return a
   checkpoint proposal; do not retain the full-history helper behind a
   compatibility wrapper.
4. Update the cron to claim four jobs, enforce one global four-operation pool,
   checkpoint successful pages, schedule bounded retries, and return non-2xx
   whenever claimed work fails. A normal partial page with remaining work is
   successful and resumes on the next invocation.
5. Change manual POST to request/resume only, add workspace-bound job detail,
   and update internal-api plus the panel's polling/localized state. Keep GET
   summary and Rust GET behavior untouched.
6. Run focused suites, deterministic two-worker claim/expired-lease pgTAP,
   full database, isolated typegen, typechecks/build, i18n, repository,
   whitespace, source-size, and exact-scope gates.

## Done criteria

- [ ] No cron or HTTP request scans a complete integration/catalog relation or
      awaits the complete reconciliation.
- [ ] One invocation claims at most four jobs, reads at most 25 source rows per
      job, and has at most four provider operations in flight globally.
- [ ] Cursor/phase/count progress resumes after deterministic failure or lease
      expiry without duplicate provider products or skipped rows; five
      deterministic failures are terminal, while ambiguous/duplicate identity
      becomes terminal immediately and never auto-creates again.
- [ ] Manual resync is a truthful 202 job contract and the UI presents actual
      bounded job progress/failure.
- [ ] Job/RPC ACLs, cross-workspace denial, full pgTAP/typegen, route/core/UI
      tests, Inventory build, and repository gates pass.

## STOP conditions

Stop on red Plan 154, unavailable Plan 163, missing ownership transfer, a
provider that cannot filter the exact four-field metadata identity, existing
duplicate provider metadata identities without an operator disposition,
duplicate job/integration state, a supported caller requiring synchronous
numeric completion, need to change the Rust GET or webhook semantics, unrelated
typegen/i18n drift, or any mandatory gate failing twice.

## Maintenance notes

Operational review should watch job age, lease expiry, attempts, per-phase
throughput, and terminal failures before increasing any bound. This plan does
not consolidate Infrastructure's broader Inventory Core fork; future work must
not reintroduce a second reconciliation worker there.
