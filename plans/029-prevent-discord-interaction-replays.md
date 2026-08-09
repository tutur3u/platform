# Plan 029: Prevent Discord Interaction Replays

> **Executor instructions:** Enforce Discord timestamp freshness and durably
> claim each interaction id before spawning or executing side effects. Duplicate
> delivery must be acknowledged without repeating work.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/discord/auth.py apps/discord/app.py apps/discord/utils.py apps/discord/tests apps/database/supabase/migrations apps/database/supabase/tests`
> Stop on material request-dispatch, deployment, or idempotency-schema drift.

## Status

- **Execution status:** TODO
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** Security / Correctness / Idempotency
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

Discord signatures authenticate the timestamp plus body but do not make a
captured request one-time. The bot accepts timestamps of any age and dispatches
commands/components/modal submissions without claiming the interaction id, so
a valid recorded request can be replayed to repeat task creation, assignment,
or other mutations.

## Current state

- `apps/discord/auth.py:27-39` verifies the Ed25519 signature over the supplied
  timestamp and body but never parses or bounds timestamp age.
- `apps/discord/app.py:903-1070` dispatches application commands and components;
  modal submissions and asynchronous `.spawn()` paths also perform mutations.
  The parsed payload's top-level Discord interaction `id` is not claimed.
- Ticket creation in `apps/discord/commands.py:1082` inserts a task directly;
  assignment flows similarly issue mutations without an interaction key.
- The bot uses the server Supabase credential from `apps/discord/utils.py`.
  Existing private-schema replay tables demonstrate the repository pattern,
  but no Discord interaction claim exists.

## Required skills and preflight

Load `$tuturuuu-database`, `$supabase`, `$tuturuuu-agent-coordination`, and the
nearest `apps/discord/AGENTS.md`. Fetch the current official Discord interaction
security guidance before implementation and record the chosen freshness window.
Use `bun sb:new` for the migration; never invent its timestamp and never push a
production database.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Python tests | `cd apps/discord && uv run pytest -q` | all pass, including replay/freshness cases |
| Python lint | `cd apps/discord && uv run ruff check .` | exit 0 |
| Python types | `cd apps/discord && uv run mypy .` | exit 0 |
| Local migration | `bun sb:reset` | exit 0; new migration and pgTAP load |
| Database tests | `bun sb:test` | exit 0, including Discord replay tests |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/discord/auth.py`, `app.py`, `utils.py`, and focused tests
- One additive migration created by `bun sb:new`
- One focused pgTAP file under `apps/database/supabase/tests/`
- Generated DB types only through `bun sb:typegen` if the runtime consumes them

Do not redesign Discord commands, change authorization rules, persist tokens or
request bodies, alter response content, or use an in-memory-only replay cache.

## Git workflow

- Branch: `fix/discord-interaction-replay` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(discord): prevent interaction replays`.
- Keep migration, runtime claim, and tests in one commit. Do not push/open a PR
  unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Reject stale and implausibly future timestamps

After header presence and before accepting the request, parse the timestamp as
integer Unix seconds. Verify the signature over the exact original header/body,
then compare against an injected clock using the current Discord-recommended
freshness tolerance. Reject malformed, stale, and too-far-future values with
401. Keep signature failures indistinguishable to callers.

**Verify:** unit tests cover exact lower/upper boundaries, one second outside,
malformed timestamps, valid current signatures, and invalid signatures without
using wall-clock sleeps.

### Step 2: Add a private durable claim primitive

Create a private table containing only opaque interaction id, interaction type,
claimed timestamp, and expiry. Revoke access from `anon`/`authenticated`; grant
only the server role required by the bot. Add an atomic claim RPC or unique
insert contract that returns whether this caller acquired the id. Include an
expiry index and a bounded cleanup strategy; never store interaction token,
body, command content, guild/user identity, or signature.

**Verify:** pgTAP proves first claim succeeds, concurrent/duplicate claim loses,
expired rows can be pruned, and public/authenticated roles cannot read or write.

### Step 3: Claim before every dispatch or immediate side effect

After signature/freshness verification and JSON shape validation, require a
valid top-level interaction id and atomically claim it before any guild lookup,
response edit, modal creation, `.spawn()`, or mutation. Apply the same gate to
PING, application commands, message components, and modal submissions. A
duplicate valid delivery should return the appropriate Discord acknowledgement
without spawning or repeating work; document the exact response per type.

If the claim store is unavailable, fail closed for mutation-bearing
interactions and log the operational failure without request secrets.

**Verify:** route tests submit the identical signed payload twice and assert
one claim, one spawn/mutation, and two protocol-valid acknowledgements. Cover
two concurrent requests racing for the same id.

### Step 4: Run database and Python gates

Apply the migration locally, run pgTAP, then Python tests/lint/types. Run
`bun sb:typegen` only after the local schema is current and only if generated
types are actually consumed. Finish with `bun check` and whitespace validation.

## Done criteria

- [ ] Malformed, stale, and implausibly future signed timestamps return 401.
- [ ] Every interaction id is durably and atomically claimed before side effects.
- [ ] Duplicate delivery never spawns or repeats a command/component/modal
      mutation and still receives a valid acknowledgement.
- [ ] Claim-store failure is fail-closed for mutation-bearing interactions.
- [ ] The replay store contains no request body, token, signature, or identity.
- [ ] Migration, pgTAP, Python tests/lint/types, `bun check`, and whitespace pass.

## STOP conditions

Stop if official Discord guidance conflicts with the selected window, if Modal
workers cannot access the same Supabase project as the ingress handler, if an
acknowledgement cannot safely distinguish duplicate delivery, or if the claim
must happen only after an asynchronous spawn. Do not substitute process memory
for durable idempotency.

## Maintenance notes

Timestamp freshness limits capture lifetime; the interaction-id claim prevents
replays inside that window and delivery retries. Retention should exceed the
freshness/retry window without accumulating indefinitely.
