# Meet erase independent ledger (V9)

Implements design r5.1 `5af2611365e00025b0c22843c115f48c440d64ea328f75e79d1a7b7d1f0fa5df`, §8.20.2. Provisioning, deploys, Security HOLD, GA HOLD and EC restrictions remain held.

## Custody and access

The ledger must leave the product Cloudflare account. Selene selects the separate custody account and approves its identities; the builder must not select one or fall back to the product account. The cross-account transport and authentication require separate approval before V12 integration: the local service-binding interface alone does not establish a cross-account connection. The Worker has no HTTP API, routes, public preview or WebSockets. No account id or real protected workspace id belongs in source.

`EraseLedgerService` accepts erase intents, outcomes and receipts. `HoldLedgerService` accepts only hold transitions and must be bound only to the authorized hold-administration runtime. Neither product runtime receives direct DO access. Rex must inventory deployed bindings and confirm no other script binds the DO via `script_name` or either service. Hold approval references are opaque generated UUIDs; the hold administrator authorizes them.

`MEET_AI_PROTECTED_WORKSPACE_IDS` is a required secret containing comma-separated canonical lowercase UUIDs, including every protected workspace. Missing, empty or malformed configuration refuses all ledger calls. Bea/Rex read it back through the approved secret-name/configuration procedure before admitting callers; never print the values. Tests use a synthetic protected id.

## Append and restore

`append(Append)` acknowledges only after SQLite and R2 contain identical bytes. Idempotent retries return the original entry. Receipt identity is `(operation_key, store, state)`, so confirmed and reconciled receipts coexist. Conflicting bytes for an identity fail with `LEDGER_CONFLICT`. Holds enforce create/release scope and kind at append time, before reserving permanent bytes. Cancellation and commitment mutually exclude each other. Outcomes and receipts without intent remain accepted for recovery compatibility; V12 must establish an intent before destructive work and V22 must reconcile absent intents independently.

A durable pending reservation precedes R2 I/O. **An append that throws may still commit later**, including when another caller appends after restart. `LEDGER_UNACKED` means acknowledgement is unknown. V12 must retry identical bytes until acknowledged and reconcile the operation; it must never say “nothing changed” on an append error. No destructive action proceeds without the intent acknowledgement. A pending transition blocks reads until recovered. There is no automatic retry loop or scheduler.

`read(after, limit)` supports 1–500 entries and checks both copies. At the tail it also lists R2 beyond the local head, detecting rollback even if the next sequence is missing. `verify()` verifies the full MAC chain and rebuilds the hold registry without exporting keys. Verification uses batches of ten entries, each in its own serialization section; it has no whole-history `blockConcurrencyWhile`. A head change between batches fails closed and the caller restarts verification. Never treat an incomplete page as the authoritative registry. V22 compares the independent recovery head and rechecks before releasing quarantine or replay batches. Active holds do not expire automatically.

## R2 guarantee and provisioning order

Cloudflare [Bucket Lock documentation](https://developers.cloudflare.com/r2/buckets/bucket-locks/) documents lock removal through dashboard, Wrangler and configuration replacement. Locks prevent object deletion/overwrite while applicable rules remain active. An account administrator or token with bucket-configuration edit permission can remove or replace those rules. This is not an irrevocable retention guarantee. [R2 token permissions](https://developers.cloudflare.com/r2/api/tokens/#permissions) distinguish Admin Read & Write (configuration access) from Object Read & Write (object operations only); object-write permission alone does not grant lock-configuration access. Reviewed 3 November 2026.

Provision strictly in this order, after Cora confirms retention and Selene resolves custody and transport:

1. Create the bucket in the selected separate custody account. Disable r2.dev; configure no custom domain, CORS or lifecycle rules.
2. Create the `ledger/` lock rule and read back its prefix, retention and permissions. Retention covers all PostgreSQL/PITR, DO, history and storage recovery windows. Retain active hold events for the hold lifetime plus the recovery window, even beyond finite lock expiry. Test create-only R2 put (`etagDoesNotMatch: '*'`) on real R2: the second differing put must fail and leave the first bytes intact. Miniflare alone does not qualify that guarantee.
3. Bea provisions `MEET_ERASE_LEDGER_KEY_V1`, exactly 64 lowercase hex characters, solely on this Worker. Provision the protected-workspace secret and verify binding inventory. Never share the ledger key with product Workers.
4. Deploy and qualify the ledger, including private access and counts/code-only diagnostics. Keep the DO migration tag `meet-erase-ledger-v1` unchanged forever; append future migrations. Never restore the ledger with the product stores.
5. Only then admit V12 and its approved private connection to `EraseLedgerService`, and the separate administration connection to `HoldLedgerService`.

No purge or delete API exists. E7 changes future retention policy only. This PR has no SQL migration; any later private verification RPC migration must sort strictly after V10 `20261103130000`. Restore order and V8 callback/signer requirements remain owned by V10/V12; this ledger does not sign document leases or decide document callback status.

## Key rotation (runbook only)

Locked entries retain their original `key_version` permanently. Current code signs/verifies version 1 only: do not provision V2 or change the signing version until the following implementation is reviewed and qualified.

1. Bea generates `MEET_ERASE_LEDGER_KEY_V2` under separate custody. Retain V1 and its recoverable escrow; never rewrite old entries or reuse a key across domains.
2. Ship a verifier that maps versions 1 and 2 to their corresponding non-extractable HMAC keys, rejects unknown versions, and still signs version 1. Qualify a full V1 replay, missing/invalid key refusals, restart, dual-copy verification and mixed-version test vectors.
3. Start the dual-verify window before switching the signer. All restore tools and custody backups must support both versions, with an independently recorded head. Selene/Rex approve the window and evidence.
4. Switch only new entries to version 2, read back signer configuration and verify the first V2 acknowledgement plus the entire mixed chain. During the window both versions verify; a signer rollback to V1 still requires the V2 verifier.
5. Close the rollout window only after every reader and recovery procedure is qualified. Retain V1 verification capability and escrow for as long as any V1 entry survives, including active holds. Never delete V1 merely because new writes use V2. Missing old keys means quarantine, never chain truncation.

## Diagnostics and qualification

Each failed DO RPC emits only `{code: LEDGER_*, count: 1}`. Unexpected exceptions map to `LEDGER_UNAVAILABLE`; no ids, input, stacks or payloads are logged. Rex must enable collection and alert on nonzero `LEDGER_HEAD_MISMATCH`, `LEDGER_MIRROR_CONFLICT`, `LEDGER_CHAIN_INVALID`, `LEDGER_HOLD_CONFLICT`, `LEDGER_UNACKED` and key/config errors before provisioning. Counters are operational signals, not per-workspace telemetry.

The deployment and runtime fixture both pin `compatibility_date` to the qualified `2026-08-06`; no later flag is required. `nodejs_compat` is removed. Qualification uses Miniflare 4.20260730.0 on skr-macbook-i9 with real SQLite/R2 simulation. Real R2 locks, production latency and cross-account transport remain unqualified. Focused Bun tests run from outside the repository to avoid its root preload. `meet_transcript_erase` stays default OFF; its kill switch stops new erases, never completion of committed work. `MEET_AI_DISABLED` does not stop erasure.

Canonical JSON reuses the V6 module from reviewed PR #7516 at `371b4460b4cbc6cd7fd90425db283c2009e4ebca`; the imported file is byte-identical to that source. MAC verification uses Web Crypto HMAC verification. Remaining review follow-ups before enablement: design-owner ruling on `plan_hash` guessability (L3), schema collection limits (L6), explicit workspace tool/dependency declarations (L8), real-R2 latency and persisted verification checkpoints for very large histories. Ten-entry serialization batches remove the whole-history lock; they do not establish a production throughput bound.
