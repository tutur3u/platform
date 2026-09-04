# Plan 118: Enforce Suspension Across Every Session-Auth Path

> **Executor instructions:** Make every successful cookie, app-session, and
> temporary-session authentication path consult one fail-closed suspension
> decision before a protected handler runs. Distinguish a confirmed active
> account from an unavailable suspension store; never cache an error as active.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/utils/src/abuse-protection/user-suspension.ts apps/*/src/lib/api-auth.ts packages/inventory-core/src/lib/api-auth.ts tmp/agent-coordination`
> Stop on auth-engine, suspension-schema, or exact-path ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** security
- **Depends on:** explicit transfer from active Forms/Web, Tasks, and Inventory auth owners
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Suspended users bypass the lightweight auth resolver even when every dependency
is healthy. The stronger wrapper also treats every suspension lookup failure as
permission to continue, and the shared utility can cache a database error as a
confirmed negative for sixty seconds.

## Current state

- `apps/web/src/lib/api-auth.ts:385-447` returns authenticated cookie and
  app-session actors from `resolveSessionAuthContext` without checking
  suspension. Sixty-four API routes across satellites use this resolver.
- `packages/utils/src/abuse-protection/user-suspension.ts:81-105` collapses a
  missing admin client, query error, and empty result into `suspended: false`;
  query errors can be cached as `not_suspended`.
- The utility catches every other lookup exception and fails open at lines
  133-135.
- `withSessionAuth` swallows suspension errors for temporary, app-session, and
  cookie actors at `apps/web/src/lib/api-auth.ts:728-746,815-831,930-946`.
  Equivalent code exists in eleven copied auth engines.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-development-tooling`. Do not start until the Forms `handoff`, working
Tasks note, and Inventory owners explicitly transfer their auth paths. The
education extraction note is canonical `done` and is not an ownership blocker.
Inventory Core is a package consumer and must remain aligned.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Suspension utility | `bun run --cwd packages/utils test -- src/abuse-protection/user-suspension.test.ts` | tri-state/cache cases pass |
| Web auth contracts | `bun run --cwd apps/web test -- src/lib/api-auth.test.ts` | all three actor modes enforce suspension |
| Tasks auth contracts | `bun --cwd apps/tasks vitest run src/lib/api-auth.test.ts` | copied-engine parity passes |
| Calendar auth contracts | `bun --cwd apps/calendar vitest run src/lib/api-auth.test.ts` | representative satellite parity passes |
| Track auth contracts | `bun --cwd apps/track vitest run src/lib/api-auth.test.ts` | Track's distinct engine semantics enforce the same boundary |
| Typechecks | `bun run --cwd packages/utils type-check && bun run --cwd packages/inventory-core type-check && bun run --cwd apps/web type-check && bun run --cwd apps/calendar type-check && bun run --cwd apps/hive type-check && bun run --cwd apps/infrastructure type-check && bun run --cwd apps/inventory type-check && bun run --cwd apps/learn type-check && bun run --cwd apps/mind type-check && bun run --cwd apps/tasks type-check && bun run --cwd apps/teach type-check && bun run --cwd apps/track type-check` | exit 0 |
| App builds | `bun run --cwd apps/web build && bun run --cwd apps/calendar build && bun run --cwd apps/hive build && bun run --cwd apps/infrastructure build && bun run --cwd apps/inventory build && bun run --cwd apps/learn build && bun run --cwd apps/mind build && bun run --cwd apps/tasks build && bun run --cwd apps/teach build && bun run --cwd apps/track build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/utils/src/abuse-protection/user-suspension.ts` and a focused new test
- the eleven current API-auth engines under Web, Calendar, Hive,
  Infrastructure, Inventory, Learn, Mind, Tasks, Teach, Track, and Inventory Core
- existing Web/Tasks tests plus new Calendar and Track auth tests, covering the
  common copied engines and Track's distinct implementation
- `plans/README.md` only for status

Do not redesign suspension administration, rate limits, adaptive controls,
session token formats, log drains, or consolidate the full API-auth engines.

## Git workflow

Use branch `fix/enforce-session-suspension` in an isolated worktree and run
`bun setup`. Commit `fix(auth): enforce suspension across session paths`.
Claim the commit window before staging; do not push unless instructed.

## Steps

### Step 1: Define one tri-state decision

Change the shared lookup contract to return `active`, `suspended`, or
`unavailable`. A successful empty database result is the only path to `active`.
Admin creation failures, query errors, malformed cache values, and unexpected
exceptions are `unavailable`. Redis read/write failure alone may fall through
to a successful database decision.

### Step 2: Correct cache semantics

Cache `active` only after a successful empty query. Never overwrite a cached
positive suspension with an unavailable result. Preserve positive entries for
their current bounded TTL and make cache-write failure non-authoritative after
the database decision has been obtained.

### Step 3: Gate both auth entry points

Create one small adapter used by `resolveSessionAuthContext` and every
temporary/app/cookie branch of `withSessionAuth`. Map suspended to the existing
403 envelope and unavailable to a stable 503 envelope with no internal detail.
Apply the same adapter to all eleven engines; do not leave resolver-only routes
outside the boundary.

### Step 4: Prove fleet parity

Test confirmed active, suspended, admin-client failure, database failure, Redis
failure, malformed cache data, and import/adapter failure. Cover cookie,
app-session, and temporary-session modes in Web; use Tasks and Calendar to prove
copied-engine parity, and test Track separately because its engine is not
byte-identical. Search all current `resolveSessionAuthContext` definitions and
suspension imports and verify every success path invokes the adapter.

### Step 5: Run package and app gates

Run focused tests, all affected typechecks and builds, `bun check`, and
whitespace. Record the availability tradeoff in the existing abuse-protection
documentation if one exists; do not create an aspirational operations promise.

## Done criteria

- [ ] Every authenticated resolver/wrapper path checks suspension before its handler.
- [ ] Lookup failures return a stable 503 rather than authenticating the actor.
- [ ] Only a successful empty query can create a cached active decision.
- [ ] Positive suspension cache state is not erased by dependency failure.
- [ ] Focused tests, affected typechecks/builds, and repository gates pass.

## STOP conditions

Stop if any auth owner has not transferred scope, a legitimate public route uses
these helpers without requiring suspension enforcement, the suspension table is
not authoritative, or an in-scope gate fails twice.

## Maintenance notes

Authentication and suspension are one access decision. New lightweight auth
helpers must reuse the same tri-state gate instead of silently weakening it.
