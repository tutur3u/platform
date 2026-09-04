# Plan 030: Bind Calendar OAuth State to the Initiating Actor

> **Executor instructions:** Replace the caller-editable workspace UUID in
> Google and Microsoft OAuth `state` values with a short-lived, single-use transaction bound to the
> authenticated Calendar actor and normalized workspace. Reauthorize before
> persisting tokens or starting a service-role sync. Run every gate and update
> this plan's row in `plans/README.md` when complete.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/calendar/src/app/api/v1/calendar/auth apps/calendar/src/lib/calendar packages/trigger/src/google-calendar-sync.ts packages/trigger/src/google-calendar-full-sync.ts packages/trigger/src/google-calendar-incremental-sync.ts apps/database/supabase/migrations apps/database/supabase/tests/calendar-oauth-state.sql packages/types/src/supabase.ts`
> Stop on material OAuth, token-storage, session, or sync drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / OAuth / Tenant isolation
- **Depends on:** generated database type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while active Mail and Zalo coordination lanes retain
ownership of generated database types, including
`packages/types/src/supabase.ts`, which this migration must regenerate. Do not
run type generation or edit the generated file until those owners transfer or
terminate their lanes.

## Why this matters

OAuth initiation for both providers verifies Calendar membership, but sends the
normalized workspace UUID as unsigned state. Each callback trusts that value and never proves
it belongs to the initiating actor, and starts an admin-backed full sync. An
authenticated user can alter state and write their external calendar data into
another tenant; the missing nonce also leaves account linking open to CSRF and
replay.

## Current state

- `apps/calendar/src/app/api/v1/calendar/auth/route.ts:16-60` authenticates the
  Calendar actor and membership, then emits only `state: normalizedWsId`.
- `callback/route.ts:25-69` trusts state and exchanges the code before
  authenticating or validating an initiated flow.
- `callback/route.ts:113-145` resolves a session but does not reverify
  workspace membership; lines 233-248 persist tokens under state-selected
  `ws_id`.
- Lines 260-295 pass the same id into service-role full sync. Existing callback
  tests accept a plain `state=workspace-1` and do not cover alteration, replay,
  actor mismatch, or expiry.
- `auth/microsoft/route.ts:78-98` repeats the plain workspace state and stores
  only a PKCE verifier cookie. `auth/microsoft/callback/route.ts:33-102` trusts
  that state; lines 145-230 authenticate only after token exchange and persist
  tokens/connections without rechecking membership. PKCE protects the code
  exchange but does not bind the callback workspace or actor.
- Microsoft provider-denial and missing-PKCE branches currently build redirects
  from raw state. Google callback debug logging includes raw state/request URL,
  and both callbacks use generic app-session acceptance instead of requiring
  the Calendar target.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`, and
`$tuturuuu-agent-coordination`. Read the nearest `AGENTS.md`, inspect active
notes, and use an additive Postgres transaction table plus atomic consumption
RPC so every deployment shares the same replay boundary.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| OAuth route tests | `bun --cwd apps/calendar vitest run 'src/app/api/v1/calendar/auth/route.test.ts' 'src/app/api/v1/calendar/auth/callback/route.test.ts' 'src/app/api/v1/calendar/auth/microsoft/route.test.ts' 'src/app/api/v1/calendar/auth/microsoft/callback/route.test.ts'` | both providers' initiation and callback security cases pass |
| Calendar typecheck | `bun run --cwd apps/calendar type-check` | exit 0 |
| Database apply | `bun sb:reset` | migration applies locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | all pgTAP tests pass |
| Database types | `bun sb:typegen` | generated Supabase types include the OAuth transaction contract |
| Repository gate | `bun check` | exit 0 |
| Calendar build | `bun run --cwd apps/calendar build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Calendar Google and Microsoft OAuth initiation/callback routes and tests
- A focused Calendar OAuth transaction helper
- One additive migration with a short-lived state table and atomic consume RPC
- `apps/database/supabase/tests/calendar-oauth-state.sql` and
  `packages/types/src/supabase.ts`
- Token-write authorization only as needed to make the invariant explicit

Do not redesign provider sync, add providers, remove Microsoft PKCE, change requested scopes, or alter
unrelated Calendar routes.

## Git workflow

- Branch: `fix/calendar-oauth-state-binding` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(calendar): bind OAuth state to actor`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Characterize the redirect contract

Add fixtures for production, Portless, localhost, reconnect-without-refresh,
and current post-auth redirects. Specify a bounded lifetime, single-use
semantics, provider, actor id, normalized workspace id, and approved redirect
origin. Keep sensitive transaction content server-side; expose only an opaque,
unguessable identifier in state.

### Step 2: Create and consume the transaction atomically

At initiation, authenticate for target `calendar`, normalize the workspace,
verify membership, and persist the transaction before producing the Google
provider authorization URL. At callback, authenticate the same Calendar actor
with `allowAppSessionAuth: { targetApp: 'calendar' }` and atomically consume
one unexpired transaction before token exchange or database writes. A missing,
altered, expired, replayed, wrong-provider, or wrong-actor state must fail with
zero token/sync calls.

### Step 3: Reauthorize the workspace before privileged work

Reverify the transaction actor's current membership using the request client.
Use only the transaction's normalized workspace afterward. Ensure token
insert/update cannot select a different workspace, and start full sync only
after the authorized token write succeeds. For any terminal callback with a
valid transaction—including provider denial/cancellation, missing code, or
missing PKCE—consume the transaction and resolve the redirect only from its
approved origin/workspace. Invalid state uses a fixed safe Calendar/root
redirect and is never interpolated. Remove or sanitize callback logging so
codes, raw state, and full callback URLs are never emitted.

### Step 4: Prove the boundary and run gates

Test both providers for state alteration, cross-workspace targeting, callback
replay, expiry, actor mismatch, anonymous/wrong-target sessions, revoked
membership, provider denial/cancellation, missing code/PKCE, token-write
failure, and successful reconnect. Cover altered, expired, and replayed state
on failure redirects as well as success callbacks. Apply the migration locally
and run all listed gates.

## Test plan

- Extend the existing Google initiation/callback tests and add matching
  Microsoft route tests using the same transaction fixtures.
- Cover success/reconnect plus altered, replayed, expired, wrong-actor,
  wrong-provider, revoked-membership, provider-denial, missing-PKCE,
  token-write-failure, and anonymous cases.
- Add database tests for expiry, actor binding, and atomic single-use consume.

## Done criteria

- [ ] OAuth state is opaque, short-lived, actor/workspace/provider-bound, and
      single-use.
- [ ] Google and Microsoft callbacks enforce the same transaction contract;
      Microsoft PKCE remains intact.
- [ ] Callback authentication and membership checks precede token exchange,
      persistence, and sync.
- [ ] Caller-controlled callback parameters never become `ws_id`.
- [ ] Existing production/local redirect and refresh-token behavior remains
      compatible.
- [ ] Focused tests, local migration, type generation, typecheck, `bun check`,
      build, and whitespace pass.

## STOP conditions

Stop if callback cookies/app sessions cannot reliably identify the initiating
actor across supported origins, if a durable store cannot be used without an
operational dependency, or if the provider requires a state shape incompatible
with opaque identifiers. Escalate the contract rather than falling back to a
signed workspace id without replay protection.

## Maintenance notes

Keep authorization independent of RLS because the subsequent sync uses
service-role access. Never log codes, tokens, raw state secrets, or transaction
payloads.
