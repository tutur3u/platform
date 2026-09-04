# Plan 285: Make Money Lover Imports Atomic and Exact-Replay Safe

> **Executor instructions:** Replace the split wallet/category/transaction
> writes with one bounded transactional import. Preserve Money Lover source IDs
> and make an exact normalized payload replay return the original result without
> inserting a second transaction.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/finance/src/app/api/workspaces/[wsId]/transactions/import/money-lover/route.ts' 'apps/finance/src/app/api/workspaces/[wsId]/transactions/import/money-lover/route.test.ts' 'apps/finance/src/app/api/workspaces/[wsId]/transactions/import/money-lover/money-lover-import.ts' 'apps/finance/src/app/api/workspaces/[wsId]/transactions/import/money-lover/money-lover-import.test.ts' packages/internal-api/src/finance.ts packages/internal-api/src/finance.test.ts packages/ui/src/components/ui/finance/transactions/money-lover-import-dialog.tsx packages/ui/src/components/ui/finance/transactions/money-lover-import-dialog.test.tsx packages/ui/src/components/ui/finance/transactions/use-money-lover-import.ts packages/ui/src/components/ui/finance/transactions/use-money-lover-import.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the canonically working Finance/Inventory
  handoff owns `apps/finance/src/**`
- **Priority:** P0
- **Effort:** L
- **Risk:** MEDIUM-HIGH
- **Category:** correctness / finance / transactions / idempotency
- **Depends on:** Plans 154 and 163; exact Finance route/UI, database migration,
  and generated-type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The current import commits inferred wallets and categories before validating all
transactions, then inserts transactions in independent 1,000-row batches. A
later failure leaves an apparently completed partial ledger. Retrying the same
file has no import identity and duplicates every successful earlier batch,
changing balances and reports twice.

## Current state and exact contract

- The request contains Money Lover rows with a source `id`, but the inserted
  `wallet_transactions` projection drops it. Wallet/category setup commits at
  `route.ts:168-269`; batch failures at `:333-381` are accumulated while the SSE
  stream still sends `type:'complete'` at `:401-409`.
- Before `formData()`, require a finite integer `Content-Length` no greater than
  **10 MiB + 64 KiB multipart overhead**; return 411 when missing/invalid and
  413 when oversized. After extraction, independently require the transactions
  field's UTF-8 encoding to be at most **10 MiB** and the parsed array to contain
  at most **10,000 rows**. Return sanitized 413 for either content limit and 400
  for malformed/invalid rows. If supported clients cannot provide the header or
  production evidence requires larger imports, STOP and replace this with a
  reviewed streaming multipart boundary rather than allocating unbounded input.
- Normalize every row to the exact persisted semantics: trimmed source ID,
  wallet/category names, parsed date, numeric amount, nullable note, currency,
  and resolved creator. Reject blank/duplicate source IDs within one payload.
  Compute SHA-256 over a deterministic JSON encoding of the normalized ordered
  rows plus workspace and format version.
- Add `private.money_lover_imports` with one unique `(ws_id, payload_sha256)`
  operation and immutable normalized-row count/result metadata. Add a private
  import-to-transaction mapping that stores `(import_id, source_id,
  wallet_transaction_id)` uniquely. This guarantees exact whole-payload replay;
  it does **not** claim that two different/subset files from one Money Lover
  account can be deduplicated without a reviewed account namespace.
- Implement one service-role-only `private.import_money_lover_transactions`
  RPC. Exact signature: `p_ws_id uuid, p_creator_id uuid, p_payload_sha256 text,
  p_rows jsonb`; return one row `(import_id uuid, imported integer, replayed
  boolean)`. It locks/claims the payload identity, resolves or creates all
  wallet/category rows, first proves `p_creator_id` is a `workspace_users` row
  in `p_ws_id`, inserts all transactions plus source mappings, and records the
  completed result in the same PostgreSQL transaction. Any invalid row, foreign
  creator, or write error rolls everything back.
- Revoke the exact RPC signature from `PUBLIC, anon, authenticated`; grant only
  `service_role`. Define it `SECURITY DEFINER SET search_path = ''` and schema-
  qualify every relation. Route authorization and linked-user resolution remain
  unchanged. Map known invalid payload/source conflicts to sanitized 400, exact
  replay to 200, and unclassified database failure to sanitized 500.
- The client/internal API generates no correctness-critical idempotency key:
  retrying the same normalized payload naturally reuses its hash. Replace fake
  per-batch progress with truthful `validating`/`committing`/`complete` events;
  never emit `complete` with partial database errors.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route/helper/client | `bun --cwd apps/finance vitest run 'src/app/api/workspaces/[wsId]/transactions/import/money-lover/route.test.ts' 'src/app/api/workspaces/[wsId]/transactions/import/money-lover/money-lover-import.test.ts' && bun --cwd packages/internal-api vitest run src/finance.test.ts && bun --cwd packages/ui vitest run src/components/ui/finance/transactions/money-lover-import-dialog.test.tsx` | normalization/hash, bounds, replay, truthful progress, and status mapping pass |
| UI runner/size | `bun --cwd packages/ui vitest run src/components/ui/finance/transactions/use-money-lover-import.test.ts && test "$(wc -l < packages/ui/src/components/ui/finance/transactions/money-lover-import-dialog.tsx)" -le 700 && test "$(wc -l < packages/ui/src/components/ui/finance/transactions/use-money-lover-import.ts)" -le 400` | extracted import runner passes and both authored modules remain bounded |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/money-lover-import.test.sql --typegen packages/types/src/supabase.ts` | atomic failure, exact replay, concurrent replay, ACL, and result tests pass |
| Types | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot" && bun run --cwd apps/finance type-check && bun run --cwd packages/internal-api type-check && bun run --cwd packages/ui type-check` | a second isolated typegen is byte-identical to the intentional generated diff; consumers compile |
| Finance build | `bun run --cwd apps/finance build` | production build exits 0 |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** the exact route/new route test and focused server normalization/
hash helper/test named above; Money Lover internal-api contract/tests; extract
submission, SSE decoding, progress, retry, and refresh
orchestration from the existing 908-line dialog into the named focused hook and
test, leaving the dialog below 700 LOC with its default export stable; additive
import-operation/mapping schema, private RPC, pgTAP, and generated types.

**Out of scope:** generic transaction import formats; guessing a Money Lover
account identity; deduplicating different payload hashes; changing ordinary
wallet/category CRUD; historic repair without an explicit dry-run; exports;
other Finance routes.

## Steps

1. Add red route/UI tests for missing/invalid/oversized `Content-Length`,
   oversized extracted JSON, over-count/malformed payloads, invalid dates/
   amounts, blank or duplicate source IDs, and the current early/late partial-
   write failures. Keep supported auth and linked-user responses exact.
2. Add the operation/mapping tables and exact private RPC with signature-level
   ACLs. Validate JSON shape/count again in SQL, serialize the payload claim,
   and perform setup, transactions, mappings, and result settlement in one
   transaction.
3. Add pgTAP fault probes after wallet setup, category setup, and a simulated
   transaction insert; each must leave zero new rows. Dispatch two independent
   connections with the same hash behind a deterministic lock barrier and prove
   one import/result and one set of transactions. Prove changed payload hashes
   are independent and exact completed replay returns `replayed:true`.
4. Move normalization/hash generation into a focused server helper and call the
   RPC once. Before changing client flow, extract the dialog's submission/SSE/
   progress/retry/refetch orchestration to `use-money-lover-import.ts`; keep the
   dialog as bounded presentation/form composition and retain its default export.
   Make progress truthful so a retry shows the original count, not a second
   success.
5. Run isolated DB/typegen, focused tests, typechecks, Finance build, `bun
   check`, whitespace, and exact-scope review.

## Done criteria

- [ ] No wallet, category, transaction, mapping, or import-operation row can
      survive a failed import transaction.
- [ ] Concurrent and later exact-payload retries create one financial result
      and return the original count without balance duplication.
- [ ] Source IDs are retained in the import mapping and duplicates within one
      payload are rejected before writes.
- [ ] Size/count limits and SSE terminal states are truthful and tested.
- [ ] The dialog is at most 700 LOC, the focused hook at most 400 LOC, and no
      stable component import changes.
- [ ] RPC ACLs, isolated database/typegen, route/UI/internal-api, typechecks,
      Finance build, repository, and whitespace gates pass.

## STOP conditions

Stop if ownership is not transferred; Plan 154 is not green; Money Lover IDs
are absent/unstable in a supported input; current production imports require
more than 10 MiB or 10,000 rows; one bounded JSON RPC cannot safely carry the
measured payload (design a staged claim/finalize protocol instead); concurrent
replay cannot be tested with independent connections; typegen changes outside
the additive schema; or a mandatory gate fails twice.

## Maintenance notes

Payload-hash replay closes retry of the same normalized import. Cross-file or
cross-account semantic dedupe needs an explicit Money Lover account namespace;
do not infer one from mutable wallet names.
