# Plan 211: Derive Cross-App Identity Claims from Canonical User Data

> **Executor instructions:** Keep the current one-time cross-app login flow and
> target-app token exchange, but remove caller authority over signed identity,
> app admission, and token lifetime before any app-session token is issued.
>
> **Drift check (run first):**
> `git diff --stat 52f4aa1b12..HEAD -- packages/auth/src/cross-app apps/web/src/legacy-api-routes/v1/auth/cross-app-token/verify apps/web/src/app/api/v1/auth/cross-app-token/verify apps/web/src/legacy-api-routes/v1/auth/cross-app-return apps/docs/platform/architecture/authentication.mdx apps/database/supabase/migrations apps/database/supabase/tests packages/tasks-api/src/server/board-access.ts packages/tasks-api/src/server/board-access.test.ts packages/types/src/supabase.ts apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** HIGH
- **Category:** security / authentication / cross-app identity
- **Depends on:** Plans 154 and 163; database/type, G22 route-artifact, and
  adjacent Tasks authorization review
- **Planned at:** commit `52f4aa1b12`, 2026-08-10

## Why this matters

An authenticated caller can currently persist arbitrary `session_data`, origin,
target, and expiry in a cross-app token. The central verifier then signs the
stored email into an app-session token, and Tasks uses that signed email for
email-addressed board shares. Token validation also treats the caller-selected
origin as authoritative when mutating registered services. A valid user can
therefore acquire a downstream identity claim that was never derived from the
canonical user record.

## Current state and exact contract

- `generate_cross_app_token(uuid,text,text,integer,jsonb)` checks only that the
  supplied user id equals `auth.uid()`, then stores every other supplied value.
- `validate_cross_app_token_with_session` returns the stored JSON and may append
  a service based on its stored `origin_app`/requested target.
- The Web verifier signs `sessionData.email`; downstream board access gives that
  email real authorization meaning.
- Preserve the current token string, one-time consumption, five-minute default,
  refresh-token separation, and successful response envelope.
- In PostgreSQL, derive stored email from `auth.users.email` for `auth.uid()` and
  ignore/remove caller-provided identity fields. The compatibility allowlist is
  exact for provenance: origins are `web`, `platform`, or `cli`; `cli` may
  target only `platform`; `web` and `platform` cannot target themselves. Keep
  the target string opaque because the maintained cross-app-return flow uses
  enabled external-app registration ids in addition to internal names. That
  route must continue resolving the id from an enabled origin-bound
  registration before minting; direct target strings gain no authority beyond
  matching the one-time verifier input. Bound expiry to 60..3600 seconds,
  preserving the documented one-hour example; values outside that range are an
  intentional `400` compatibility break. Token validation must never add a
  service from caller-authored provenance.
- In the central Web verifier, reload the canonical email for `validation.userId`
  with the trusted server client and sign only that value. Returned `sessionData`
  may contain the canonical email for compatibility, never untrusted metadata.
- Move the substantially changed verifier and its test from the legacy tree to
  the existing first-class wrapper destination. There is no current explicit
  route override: leave `route-overrides.json` unchanged and regenerate the
  manifest so its default first-class `legacy-next` source is recorded. Keep
  Rust ownership `legacy-next` unless full parity is separately implemented.
- Update the canonical authentication guide with the exact origin/pair,
  registered-external-target, and 60..3600-second contract; keep its 3600-second
  example valid.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read Web/database/Tasks AGENTS files. Execute from the green
Plan 154 plus completed Plan 163 base after ownership transfer; run `bun setup`
immediately in an isolated worktree.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Caller inventory | `rg -n 'generate_cross_app_token|validate_cross_app_token_with_session|cross-app-token/verify' apps packages --glob '!apps/database/supabase/migrations/**' --glob '!packages/types/src/supabase.ts' --glob '!plans/**'` | every generator/verifier classified; no unreviewed identity consumer |
| Focused auth/Web | `bun --cwd packages/auth vitest run src/cross-app/index.test.ts src/cross-app/server.test.ts && bun --cwd apps/web vitest run src/app/api/v1/auth/cross-app-token/verify/route.test.ts src/legacy-api-routes/v1/auth/cross-app-return/route.test.ts` | canonical identity, bounds, internal and registered-external targets, one-time use, and response compatibility pass |
| Tasks regression | `bun --cwd packages/tasks-api vitest run src/server/board-access.test.ts` | forged session email cannot grant an email-addressed share; canonical email still can |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/cross-app-token-identity.sql && bun --cwd apps/database sb:validate:isolated` | claim derivation, app/lifetime validation, no admission side effect, ACLs, and full suite pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/cross-app-token-identity.sql` | generated contract is current |
| Route tracking | `bun web:api-routes:check && bun migration:tanstack:manifest` | no wrapper regeneration; first-class source is recorded |
| Builds/backend | `bun run --cwd apps/web build && bun run --cwd packages/auth type-check && bun run --cwd packages/tasks-api type-check && bun check:backend` | all exit 0; route remains correctly classified |
| Repository | `bun check && git diff --check` | all gates pass; no whitespace errors |

## Scope

**In scope:** additive migration and focused pgTAP; cross-app generation helpers
and tests; first-class Web verifier/test; cross-app return characterization;
canonical authentication docs; Tasks board-access regression test only;
generated DB types and route manifest. **Out of scope:** route-overrides changes,
changing app-session token format, refresh semantics,
board-share policy, adding services during login, unrelated auth routes,
production apply, or declaring a Rust cutover.

## Steps

1. Inventory every generator/verifier and freeze current successful envelopes,
   one-time consumption, registered-external-app return, and canonical-email
   board-share behavior. Add red tests for a forged email, unsupported origin
   pair, excessive/negative expiry, and origin-driven service mutation.
2. Add the fail-closed database contract: canonical email lookup, closed app
   origin/pair rules, opaque external target preservation, 60..3600-second
   expiry, no caller-controlled admission, fixed search paths, and exact
   function ACLs. Cover legacy overload behavior explicitly rather than leaving
   a bypass.
3. Make every package helper omit identity metadata. Replace the generated Web
   wrapper with the moved verifier/test, reload canonical identity before
   signing, preserve the response using canonical session data only, and update
   the authentication guide with the exact compatibility contract.
4. Run focused/full DB before typegen, route tracking, auth/Tasks/build/backend,
   repository, whitespace, and final scope gates.

## Done criteria

- [ ] No caller-provided email or session field can enter a signed app session.
- [ ] Origin/pair and lifetime inputs are closed and bounded; registered
  external target ids still work, while validation cannot mutate service
  admission from caller-authored provenance.
- [ ] One-time exchange and existing successful clients remain compatible.
- [ ] Forged email cannot grant Tasks board-share access.
- [ ] All database, auth, Web, Tasks, route-tracking, backend, build, repository,
  and whitespace gates pass.

## STOP conditions

Stop on an unknown supported app pair/lifetime, required service-admission side
effect without a trusted source, app-session response drift, inability to reload
canonical identity, red Plan 154 baseline, ownership conflict, default-stack
mutation, or any mandatory gate failing twice.
