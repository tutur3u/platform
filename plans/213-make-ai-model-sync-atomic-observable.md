# Plan 213: Make AI Gateway-Model Sync Atomic and Observable

> **Executor instructions:** Validate one complete bounded provider snapshot,
> apply it in one database transaction, and make every incomplete fetch or write
> return a failed route/cron result instead of a partial HTTP 200.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- packages/ai/src/credits/sync-gateway-models.ts packages/ai/src/credits/sync-gateway-models.test.ts apps/web/src/legacy-api-routes/cron/ai/sync-models apps/web/src/app/api/cron/ai/sync-models apps/infrastructure/src/app/api/v1/admin/ai-credits/sync-models apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / AI billing / test coverage
- **Depends on:** Plans 154 and 163; database/type and G22 route-artifact review
- **Planned at:** commit `52f4aa1b12`, 2026-08-10

## Why this matters

The sync service catches each failed 100-row upsert, continues, and returns a
normal result. Both production-authority routes return that result with HTTP
200, including empty snapshots. Pricing and availability can therefore expose
a mixed old/new catalog while schedulers and operators see success.

## Current state and exact contract

- Preserve the two source mappings, source-specific `is_enabled` rules, model
  ids, pricing JSON, max-token normalization, and successful result counters.
- Fetch every provider page before writing. Require valid JSON arrays/objects,
  unique nonempty ids, internally consistent advertised totals, termination
  before page 101, and at most 10,000 normalized models. Empty, malformed,
  duplicate, truncated, or exhausted snapshots are failures with no write.
- Add a private fixed-search-path, service-role-only RPC accepting the validated
  JSON snapshot and source. It validates the same 10,000-row bound and upserts
  the complete snapshot set-wise in one transaction. It does not disable/delete
  absent models because the current contract does not.
- The service throws a typed sanitized failure on fetch/validation/apply errors;
  neither route returns 200. Web cron and Infrastructure operator routes return
  `502` for upstream snapshot failure and `500` for persistence/shape failure.
- Move the substantially changed Web cron route/test first-class. There is no
  matching explicit override: leave `route-overrides.json` unchanged,
  regenerate the manifest's default first-class `legacy-next` source, and make
  no Rust migration claim.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from green Plan 154 plus completed Plan 163 after
database/G22 transfer; run `bun setup` immediately.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Service/routes | `bun --cwd packages/ai vitest run src/credits/sync-gateway-models.test.ts && bun --cwd apps/web vitest run src/app/api/cron/ai/sync-models/route.test.ts && bun --cwd apps/infrastructure vitest run src/app/api/v1/admin/ai-credits/sync-models/route.test.ts` | paging, validation, atomic apply, retry, counters, and 500/502 mapping pass |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/ai-gateway-model-snapshot-sync.sql && bun --cwd apps/database sb:validate:isolated` | all-or-nothing upsert, bounds, ACLs, and full suite pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/ai-gateway-model-snapshot-sync.sql` | private RPC signature is current |
| Route tracking | `bun web:api-routes:check && bun migration:tanstack:manifest && bun check:backend` | first-class source recorded; no false Rust migration claim |
| Types/builds | `bun run --cwd packages/ai type-check && bun run --cwd apps/web build && bun run --cwd apps/infrastructure build` | all exit 0 |
| Repository | `bun check && git diff --check` | all checks pass; no whitespace errors |

## Scope

**In scope:** sync service/new test; Web cron first-class route/new test;
Infrastructure operator route/new test; one private transactional RPC migration,
pgTAP, generated types, and route manifest. **Out of scope:** route-overrides
changes, model-list GET,
pricing calculations, credit settlement, automatically disabling/deleting absent
models, durable scheduling, provider credentials, production apply, or Rust
implementation.

## Steps

1. Inject source-fetch and persistence seams. Add red tests for empty/malformed/
   duplicate/truncated/page-101 snapshots, later-page failure, apply failure,
   retry, and both routes' status mapping.
2. Normalize and validate the full bounded snapshot before persistence. Keep
   source mapping and existing-model counter semantics exact.
3. Add the private set-wise transaction with exact ACLs. Replace batch upserts
   with one RPC and prove a rejected row leaves the prior catalog untouched.
4. Move the Web route/test first-class and make both adapters fail observably.
   Run DB/typegen, route/backend, type/build, repository, and scope gates.

## Done criteria

- [ ] No provider fetch or apply failure can expose a partial catalog or HTTP 200.
- [ ] One validated snapshot is applied transactionally within fixed bounds.
- [ ] Current source mappings, enablement, successful counters, and absent-model
  behavior remain unchanged.
- [ ] The RPC is private/fixed-search-path/service-role-only.
- [ ] Focused/full DB, typegen, route/backend, builds, repository, and whitespace
  gates pass.

## STOP conditions

Stop on unclear provider pagination/total semantics, a supported snapshot above
10,000 models, need to change absent-model enablement, pricing-shape ambiguity,
red Plan 154 baseline, ownership conflict, default-stack mutation, or a
mandatory gate failing twice.
