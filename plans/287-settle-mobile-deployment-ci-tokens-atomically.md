# Plan 287: Settle Mobile Deployment CI Tokens Atomically

> **Executor instructions:** Make CI-token issue/revoke and their audit event
> one database transition, then characterize validation and both HTTP routes.
> Give issuance a stable operation ID and domain-separated deterministic token
> derivation so an ambiguous response can replay the same credential.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/infrastructure/src/lib/mobile-deployment/store.ts apps/infrastructure/src/lib/mobile-deployment/store-primitives.ts apps/infrastructure/src/lib/mobile-deployment/ci-token-store.ts apps/infrastructure/src/lib/mobile-deployment/ci-token-store.test.ts apps/infrastructure/src/app/api/v1/mobile-deployment/tokens/route.ts apps/infrastructure/src/app/api/v1/mobile-deployment/tokens/route.test.ts 'apps/infrastructure/src/app/api/v1/mobile-deployment/tokens/[tokenId]/route.ts' 'apps/infrastructure/src/app/api/v1/mobile-deployment/tokens/[tokenId]/route.test.ts' 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/mobile-deployment/mobile-deployment-client.tsx' 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/mobile-deployment/mobile-deployment-client.test.tsx' apps/infrastructure/messages/en.json apps/infrastructure/messages/vi.json packages/internal-api/src/infrastructure/mobile.ts packages/internal-api/src/infrastructure/mobile.test.ts packages/internal-api/src/infrastructure/types.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — database/type ownership and adjacent
  Infrastructure mobile-deployment authority must transfer
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / credentials / mobile deployment / tests
- **Depends on:** Plans 154 and 163; coordinate Plans 173, 174, 201, and 235
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Issuance inserts a valid token hash, then separately attempts its audit event
and reloads state. Audit failure is only warned, so credential/audit history can
diverge; state-reload failure returns 500 without the one-time plaintext while
an unknown active credential remains. Revocation also commits before its audit.
The real route/store boundaries and validation rules have no focused tests.

## Current state and exact contract

- `store.ts:969-1001` generates plaintext, inserts its hash-only row, audits,
  then reloads state. `:1014-1030` revokes then audits. `:1033-1068` validates
  prefix, environment, non-revocation, expiry, platform, and hash.
- Add nullable `issue_operation_id uuid` and `issue_expires_in_days smallint`
  for historical compatibility, a `1..365` check for non-null duration, and a
  unique partial index on `(environment_id, issue_operation_id)` where non-null.
  Preserve `expiresInDays`; require a client-generated UUID on new issue
  requests. One UI submit retains that UUID across transport retries, while a
  deliberate new issue action creates a new UUID. In the trusted server store,
  derive the 32-byte token payload as
  `HMAC-SHA-256(ENCRYPTION_MASTER_KEY, "mobile-deployment-ci-token:v1:" ||
  environment_id || ":" || actor_user_id || ":" || issue_operation_id)` and
  encode it base64url behind the existing prefix. Never send the operation ID
  to the validation endpoint or treat it as a secret. Add private
  service-role-only RPC
  `private.issue_mobile_deployment_ci_token(p_environment_id uuid, p_name text,
  p_token_prefix text, p_token_hash text, p_last_four text, p_platforms text[],
  p_expires_in_days smallint, p_actor_user_id uuid, p_issue_operation_id uuid)`
  returning the exact
  `MobileDeploymentTokenStatus` fields (`id,name,token_prefix,last_four,
  platforms,expires_at,revoked_at,created_at,last_used_at`) without `token_hash`.
  It validates nonblank/bounded fields, allowed nonempty platforms,
  duration `1..365`, actor existence, and environment. A first operation uses
  one `clock_timestamp()` to compute/store `expires_at`, inserts the token plus
  `token.issued` audit atomically. A retry does not recompute or compare an
  absolute expiry: it locks/reads the same operation and returns its stored
  expiry/status without a second audit only when the actor, name, platforms,
  stored `issue_expires_in_days`, and hash are identical and
  `created_at`
  is less than 10 minutes old. Changed actor/request data returns
  `TOKEN_ISSUE_REPLAY_CONFLICT` (409); an older operation returns
  `TOKEN_ISSUE_REPLAY_EXPIRED` (409), after which the UI refetches and offers
  explicit revoke. A stored hash mismatch for the same derived operation (for
  example after master-key rotation) returns `TOKEN_ISSUE_KEY_MISMATCH` and
  requires explicit operator revocation.
- Add private service-role-only RPC
  `private.revoke_mobile_deployment_ci_token(p_environment_id uuid, p_token_id
  uuid, p_actor_user_id uuid)` returning the revoked row. It locks the target,
  rejects missing/foreign/already-revoked tokens with one non-disclosing
  `TOKEN_NOT_FOUND`, sets one `clock_timestamp()` on `revoked_at`, and inserts
  `token.revoked` in the same transaction and returns
  `{token_id,revoked_at}`. Exact replay remains 404, matching a nonexistent
  token; do not fabricate a second audit event.
- Revoke both exact signatures from `PUBLIC, anon, authenticated`; grant only
  `service_role`. Define both `SECURITY DEFINER SET search_path = ''`, schema-
  qualify every relation, and map known validation/not-found codes to current
  400/404 envelopes and unknown failures to sanitized 500.
- Change the POST response to `{token, ciToken, replayed}` and DELETE response to
  `{tokenId, revokedAt}`. Update internal-api types and the dashboard client so
  it stores/displays plaintext immediately, then performs the existing state
  refetch as a separate best-effort UI refresh. A refresh failure shows a
  warning while the successful mutation and one-time plaintext remain visible;
  it must not turn the mutation response into failure. Never perform a fallible
  post-commit read on the plaintext-return critical path.
- Add one bilingual `mobile-deployment-settings.tokenRefreshFailed` warning
  explaining that the token mutation succeeded but the displayed state could
  not refresh. A **post-issue refresh failure** must leave confirmed plaintext
  visible/copyable; a **post-revoke refresh failure** must retain the confirmed
  success acknowledgement and offer the existing refresh action. RPC,
  validation, or mutation failure must show the existing destructive error and
  must not display plaintext or acknowledge success.
- Database commit and HTTP delivery cannot be atomic. A commit followed by
  transport timeout is an explicit ambiguous outcome; retrying the same
  `issueOperationId` deterministically returns the same plaintext and row.
  Tests must simulate commit-then-response-loss and prove one row, one audit,
  one active credential, and identical valid plaintext on a same-actor retry
  inside 10 minutes; cross-actor and expired replays must not reveal plaintext.
- Validation semantics remain unchanged and must never log/snapshot plaintext,
  token hashes, secrets, or raw database errors.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Store/routes/UI | `bun --cwd apps/infrastructure vitest run src/lib/mobile-deployment/ci-token-store.test.ts src/app/api/v1/mobile-deployment/tokens/route.test.ts 'src/app/api/v1/mobile-deployment/tokens/[tokenId]/route.test.ts' 'src/app/[locale]/(dashboard)/[wsId]/mobile-deployment/mobile-deployment-client.test.tsx'` | issue/revoke/validate, auth, response, refetch warning, audit, and sanitized failure tests pass |
| Source size | `test "$(wc -l < apps/infrastructure/src/lib/mobile-deployment/ci-token-store.ts)" -le 400` | new credential module remains focused and bounded |
| Internal API | `bun --cwd packages/internal-api vitest run src/infrastructure/mobile.test.ts` | bounded issue/revoke response contracts pass |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/mobile-deployment-ci-tokens.test.sql --typegen packages/types/src/supabase.ts` | atomic issue/revoke, operation retry, concurrency, ACL, and rollback tests pass |
| Types | `typegen_snapshot=$(mktemp) && cp packages/types/src/supabase.ts "$typegen_snapshot" && bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts && cmp "$typegen_snapshot" packages/types/src/supabase.ts && rm -f "$typegen_snapshot" && bun run --cwd apps/infrastructure type-check` | a second isolated typegen is byte-identical to the intentional generated diff; Infrastructure compiles |
| Localization | `bun i18n:sort && bun i18n:key-parity && bun i18n:namespace-check` | English/Vietnamese refresh warning is sorted and aligned |
| Infrastructure build | `bun run --cwd apps/infrastructure build` | production build exits 0 |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** first extract token issue/revoke/validation from the legacy
1,415-line store into `ci-token-store.ts` (at most 400 LOC) with stable thin
re-exports from `store.ts`; move the already-shared `privateDb`,
`getProductionEnvironment`, and `recordAudit` implementations unchanged into
cycle-free `store-primitives.ts`, importing that module from both stores and
retaining any public `store.ts` re-export; the two token routes; dashboard client
and existing test; internal-api mobile implementation, types, and test;
Infrastructure English/Vietnamese message bundles; focused token module/route
tests; additive private RPC migration, pgTAP, generated types.

**Out of scope:** version activation/rollback (Plan 235); bundles/artifacts;
GitHub installation tokens (Plan 284); token display outside the same-operation
10-minute ambiguity window; OIDC; unrelated mobile-deployment state-machine
refactors.

## Steps

1. First extract the three named shared primitives without behavior changes, so
   `store.ts` and `ci-token-store.ts` never import each other. Move the existing
   token functions unchanged into the focused sibling, retain thin exports from
   `store.ts`, and move characterization there. Add red store/route tests for
   authorization, mutation content type/origin, required operation UUID and
   stable duration, schema bounds, hash-only persistence, bounded same-
   operation plaintext replay, cross-actor/expired refusal, unknown/duplicate
   revoke, typed/unknown errors, and no secret-bearing output.
2. Add both exact RPCs with row locking, explicit validation, atomic audit, and
   signature-specific ACLs. Add pgTAP fault injection proving audit failure
   rolls back token insert/revoke and two concurrent revokes produce one state
   transition/audit. Add first issue, identical same-operation replay,
   same-operation changed-payload conflict, key-mismatch refusal, and concurrent
   same-operation cases.
3. Replace split writes with the RPCs and exact bounded mutation responses.
   Update internal API/UI to preserve plaintext first and refetch full state
   separately; characterize the warning path without losing the credential.
4. Characterize validation: wrong prefix, lookup error, no candidate, expired,
   revoked, wrong platform, hash mismatch, and valid token. Freeze time and use
   obvious fake values only.
5. Run isolated DB/typegen, focused tests, Infrastructure typecheck/build, `bun
   check`, whitespace, and exact-scope review.

## Done criteria

- [ ] A failed issue/audit transaction leaves no active credential; a confirmed
      response returns plaintext, and an ambiguous response replays the same
      operation/credential without accumulating an unknown token.
- [ ] Revocation and its single audit event commit or roll back together under
      concurrent attempts.
- [ ] Every token validity predicate and both HTTP boundaries are covered
      without real credentials or secret-bearing snapshots/logs.
- [ ] CI-token logic lives in a focused module at most 400 LOC; the oversized
      legacy store gains no new token orchestration and keeps stable exports.
- [ ] RPC ACLs, pgTAP/typegen, focused tests, Infrastructure type/build,
      repository, and whitespace gates pass.

## STOP conditions

Stop if Plan 154 is not green; database/type/Infrastructure authority is not
transferred; the client cannot retain one operation UUID across request retries;
domain-separated derivation cannot use the existing server-only master key;
same-operation stored/request metadata or hash differs; current clients depend
on repeated plaintext display; RPCs would be exposed beyond service role; tests
require real credentials; generated types drift outside the additive schema;
or a mandatory gate fails twice.

## Maintenance notes

Credential plaintext is unrecoverable from its stored hash, and a committed
database write cannot be atomic with HTTP delivery. Domain-separated
deterministic derivation plus stable operation identity makes that ambiguity
replayable without persisting plaintext or creating a second credential.
