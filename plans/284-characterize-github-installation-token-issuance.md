# Plan 284: Characterize GitHub Installation-Token Issuance

> **Executor instructions:** Add deterministic service and route tests around
> the watcher credential-to-GitHub installation-token boundary. Do not contact
> GitHub, mint real credentials, or change production behavior in this plan.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/infrastructure/src/lib/infrastructure/github-bot/clients.ts apps/infrastructure/src/lib/infrastructure/github-bot/state.ts apps/infrastructure/src/lib/infrastructure/github-bot/shared.ts apps/infrastructure/src/lib/infrastructure/github-bot.test.ts apps/infrastructure/src/lib/infrastructure/github-bot-clients.test.ts apps/infrastructure/src/app/api/v1/infrastructure/github-bot/installation-token/route.ts apps/infrastructure/src/app/api/v1/infrastructure/github-bot/installation-token/route.test.ts tmp/agent-coordination`

## Status

- **Execution status:** TODO — no active exact-path owner
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** test coverage / credential issuance / GitHub integration
- **Depends on:** none
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

This route exchanges a database-backed watcher bearer token for a write-capable,
repository-scoped GitHub installation credential. Existing Infrastructure tests
cover helper/redaction behavior but never exercise prefix/hash/revocation/
expiry validation, provider mint arguments, usage settlement, audit recording,
or HTTP error sanitization.

## Current state and exact contract

- `issueGitHubInstallationTokenForWatcher` requires configuration, validates
  the watcher prefix and lookup candidates, rejects revoked/expired rows in the
  query, verifies the full hash, calls `mintInstallationToken`, updates
  `last_issued_at` and `last_used_at` to one timestamp, records
  `installation_token.issued`, then returns token, expiry, fixed permissions,
  and configured repository owner/name.
- The route accepts only case-insensitive `Bearer <nonempty token>` after trim.
  Missing/malformed auth returns no-store
  `401 {code:'invalid_token',message:'Unauthorized'}`. Typed
  `GitHubBotStoreError` preserves its status/code/message; unknown errors are
  sanitized no-store 500. Every response must retain `Cache-Control:no-store`.
- Tests must inject/fake time, hash validation, private DB chains, configuration,
  GitHub minting, and audit recording. No test may read environment credentials,
  make a network call, or snapshot a real token.
- This plan characterizes the current post-mint ordering. A usage-update or
  audit failure after provider acceptance is an ambiguous credential issuance;
  tests must expose that exact behavior and open a follow-up if production code
  needs durable replay/reconciliation. Do not paper it over by changing the
  expected status here.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Service | `bun --cwd apps/infrastructure vitest run src/lib/infrastructure/github-bot-clients.test.ts` | validation, mint, usage, audit, and post-mint failure matrix passes |
| Route | `bun --cwd apps/infrastructure vitest run src/app/api/v1/infrastructure/github-bot/installation-token/route.test.ts` | bearer, typed/unknown errors, no-store, and success pass |
| Existing | `bun --cwd apps/infrastructure vitest run src/lib/infrastructure/github-bot.test.ts` | current helper suite remains green |
| App | `bun run --cwd apps/infrastructure type-check && bun run --cwd apps/infrastructure build` | Infrastructure compiles/builds |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** create the two named focused test files; add only the narrowest
export/injection seam in `clients.ts`/`state.ts` if module mocking cannot
deterministically control time, hashing, provider, DB, and audit behavior.

**Out of scope:** changing auth/error/status/order/retry semantics; creating a
new database table; token rotation; watcher-token issue/revoke UI; GitHub branch
reconciliation; permissions/repository scope; network/E2E tests; secrets.

## Steps

1. Build a reusable fluent private-schema test double and freeze time. Add red
   service cases for bad prefix, lookup error, no candidates, hash mismatch,
   revoked/expired/config-mismatched rows, and configuration failure. Assert no
   provider mint for every rejection.
2. Add the exact success case: one repository-scoped mint, fixed permissions,
   one shared issuance timestamp for both usage fields, exact audit actor/event/
   metadata, and response repository/expiry/token. Use obvious fake tokens only.
3. Characterize provider failure, usage-update failure, and audit failure. Assert
   ordering and that database/provider internals are not returned through the
   route. Record the post-mint ambiguity as a maintenance follow-up rather than
   changing runtime behavior.
4. Add route cases for absent, wrong-scheme, whitespace-only, and trimmed mixed-
   case bearer headers; typed 401/other typed status; unknown sanitized 500; and
   success. Assert `no-store` on every response and admin client `noCookie:true`.
5. Run focused/existing tests, app typecheck/build, `bun check`, whitespace, and
   exact-scope review.

## Done criteria

- [ ] Every watcher validity predicate and GitHub mint argument is covered.
- [ ] Usage/audit settlement order and all post-mint failures are explicit.
- [ ] Route bearer parsing, typed errors, unknown sanitization, success, and
      no-store headers are covered without live credentials/network.
- [ ] Runtime behavior is unchanged except a minimal testability seam if needed.
- [ ] Focused/existing/app/build/repository gates pass.

## STOP conditions

Stop on a new exact-path owner; tests require real GitHub/Supabase credentials;
determinism requires a broad runtime refactor; current behavior must change to
make assertions pass; a test exposes credential material in logs/snapshots; or
a mandatory gate fails twice.

## Maintenance notes

If characterization confirms a provider token can be issued before a local
usage/audit failure returns 500, promote a separate durable idempotency and
reconciliation plan; do not bury that production decision inside test work.
