# Plan 061: Move Mira Rewards Behind Verified Events

> **Executor instructions:** Make XP, achievements, streaks, and focus rewards
> consequences of verified idempotent server events, never caller-selected
> amounts, codes, user IDs, or session IDs.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/web/src/legacy-api-routes/v1/mira apps/web/src/app/api/v1/mira 'apps/web/src/app/[locale]/(dashboard)/[wsId]/mira/client.tsx' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/mira/client.test.tsx' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/mira/hooks/use-achievements.ts' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/mira/hooks/use-achievements.test.tsx' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/mira/hooks/use-mira.ts' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/mira/hooks/use-mira.test.tsx' apps/tasks/src/app/api/v1/mira/tasks/complete apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on reward, achievement, focus-session, task-completion, or migration
> ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** Security / Reward integrity
- **Depends on:** G22 generated migration-artifact ownership release
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Authenticated users can submit arbitrary XP amounts and any achievement code.
Separately, public `SECURITY DEFINER` functions accept caller-selected user and
focus-session identifiers and inherit broad execution grants. Mira levels,
streaks, achievements, and focus statistics are therefore not a trustworthy
record of completed product events.

## Current state

- `mira/xp/route.ts:15-56` accepts a positive amount and arbitrary source, then
  forwards both to `award_mira_xp`.
- `mira/achievements/unlock/route.ts:16-100` accepts any catalog code, inserts
  the unlock, and awards catalog XP without evaluating its condition.
- `mira/types/mira.ts:353-397` contains achievement eligibility only in client
  code; it is not an authorization boundary.
- `20260219100000_rename_tuna_to_mira.sql:205-350` defines public definer
  functions that trust `p_user_id` or `p_session_id` and never compare
  `auth.uid()` or a verified actor.
- `apps/tasks/.../mira/tasks/complete/route.ts:170-220`, Mira feed, and Mira
  focus completion are legitimate event sources but call the same generic XP
  primitive and lack one durable reward-event identity.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$supabase-postgres-best-practices`, and `$tuturuuu-agent-coordination`. Do not
start while G22 owns route overrides/manifests or generated database types.
Inventory every caller of the four Mira functions and both public reward routes
before designing the migration.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Web tests | `bun run --cwd apps/web test -- 'src/app/api/v1/mira/achievements/claim/route.test.ts' 'src/app/api/v1/mira/focus/complete/route.test.ts' 'src/app/api/v1/mira/pet/feed/route.test.ts' 'src/app/[locale]/(dashboard)/[wsId]/mira/client.test.tsx' 'src/app/[locale]/(dashboard)/[wsId]/mira/hooks/use-achievements.test.tsx' 'src/app/[locale]/(dashboard)/[wsId]/mira/hooks/use-mira.test.tsx'` | reward routes and caller contracts pass |
| Tasks test | `bun --cwd apps/tasks vitest run 'src/app/api/v1/mira/tasks/complete/route.test.ts'` | task reward is actor-bound and idempotent |
| Database reset | `bun sb:reset` | migrations apply locally |
| Database tests | `bun run --cwd apps/database scripts/run-supabase.js test db` | privilege/event tests pass |
| Database types | `bun sb:typegen` | generated types are current |
| Route wrappers | `bun web:api-routes:check` | no stale legacy wrapper |
| Migration manifest | `bun migration:tanstack:manifest && bun migration:tanstack:check` | metadata is current and check passes |
| Backend gate | `bun check:backend` | unchanged backend coverage remains green |
| App typechecks | `bun run --cwd apps/web type-check && bun run --cwd apps/tasks type-check` | both exit 0 |
| Repository gate | `bun check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Tasks build | `bun run --cwd apps/tasks build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- Delete the legacy generic XP implementation and generated wrapper at
  `apps/web/src/{legacy-api-routes,app/api}/v1/mira/xp/route.ts`; do not add a
  replacement XP endpoint
- Replace the legacy `/api/v1/mira/achievements/unlock` implementation and
  generated wrapper with first-class
  `apps/web/src/app/api/v1/mira/achievements/claim/route.ts` plus its test
- Move focus completion and feeding from their legacy files/generated wrappers
  to first-class `apps/web/src/app/api/v1/mira/focus/complete/route.ts` and
  `apps/web/src/app/api/v1/mira/pet/feed/route.ts`, each with a colocated test
- `apps/tasks/src/app/api/v1/mira/tasks/complete/route.ts` and focused test
- `use-achievements.ts`/test to call `/achievements/claim` without a code, and
  `use-mira.ts`/test to remove `useAwardXp` and send/reuse a feed event UUID
- `apps/web/src/app/[locale]/(dashboard)/[wsId]/mira/client.tsx` plus a focused
  test: the click handler creates one UUID and passes it as the mutation variable
- One additive reward-event/actor-hardening migration, pgTAP tests, generated
  types, route override re-keying, and regenerated migration manifest

Do not redesign Mira visuals, levels, reward amounts, catalog content, Tasks
completion UX, or unrelated AI/voice behavior.

## Git workflow

- Branch: `fix/mira-verified-rewards` in an isolated worktree; run `bun setup`
  immediately.
- Conventional Commit: `fix(mira): bind rewards to verified events`.
- Do not push/open a PR unless instructed. Claim the commit window before staging.

## Steps

### Step 1: Close the database privilege boundary

Add pgTAP assertions for actual function ACLs and actor mismatch. Move the
generic award primitive into `private`, make it service-role-only, fully qualify
objects, and use a safe search path. Revoke the public Mira definer functions
from `PUBLIC`, `anon`, and `authenticated`; replace or drop them only after all
callers migrate. A server-only function receiving an actor ID must independently
validate the affected pet/session/task belongs to that actor.

### Step 2: Persist idempotent reward events

Add a private reward-event ledger with a unique `(user_id, event_type,
event_id)` key. Implement these exact contracts; do not choose alternative
replay semantics during execution:

| Event | Stable key and eligibility | Authoritative reward/state bundle | Replay and failure contract |
| --- | --- | --- | --- |
| Task completion | `task_completion` + task UUID; lock the task and accept only an actor-authorized incomplete-to-complete transition | Derive XP from the persisted priority/due state using the current server formula; atomically complete/move the task, insert the ledger row, update pet XP, and increment the daily task count | The same actor retry returns the stored completion/reward with 200; foreign/ineligible tasks retain current denial; any write failure rolls back the whole bundle |
| Focus completion | `focus_completion` + focus-session UUID; lock an actor-owned unfinished session | Derive duration and XP from persisted session timestamps/plan using the current formula; atomically complete the session, ledger, pet XP, daily focus statistics, and newly eligible achievement rows | Retry returns the stored session/reward with 200; foreign/already-conflicting sessions are denied; any write failure rolls back |
| Feeding | `feed` + a client-generated UUID created once per deliberate feed click and reused by TanStack Query retries; lock the actor's pet and enforce the persisted four-hour cooldown | Use the existing server constant of 5 XP; atomically update hunger/`last_fed_at`, ledger, pet XP, and feed-related daily statistics | Same UUID returns the stored result with 200; a different UUID inside the cooldown retains the current rate-limit response; any write failure rolls back |
| Achievement claim | `achievement` + private-catalog achievement UUID; the server evaluates every supported condition from persisted state | Take XP only from the private catalog and atomically insert each unlock, ledger row, pet XP, and related daily total | Already-claimed or no-newly-eligible calls are idempotent 200 no-ops; unsupported conditions hit the STOP condition; any write failure rolls back all awards from that claim |

Event-specific private operations must implement those bundles, rather than
letting route code sequence independent mutations.

Use this exhaustive disposition for the 20 seeded achievement codes; do not
infer eligibility from client state or invent a predicate:

| Codes | Authoritative server predicate |
| --- | --- |
| `first_conversation`, `week_streak`, `month_streak` | Persisted pet `total_conversations >= 1`, `streak_days >= 7`, or `streak_days >= 30` respectively |
| `level_5`, `level_10`, `level_25` | Persisted pet level meets the named threshold |
| `first_focus`, `focus_10`, `focus_50` | Count actor-owned completed focus sessions and compare with 1, 10, or 50 |
| `long_focus` | An actor-owned completed focus session has `actual_duration >= 60` |
| `total_focus_100`, `total_focus_1000` | Persisted pet `total_focus_minutes` meets the named threshold |
| `remember_me` | Actor-owned persisted Mira memory count is at least 10 |
| `fed_tuna` | A successful `feed` reward-ledger event exists; retain the seeded `fed_tuna` code and delete the nonexistent client-only `fed_mira` check |
| `fully_customized` | At least three distinct actor-owned accessory rows are currently `is_equipped = true` |
| `perfect_day` | One actor-owned daily-stat row has `focus_sessions_completed >= 3` |
| `early_bird`, `night_owl` | Disable from automatic claiming until a durable user timezone exists; UTC/server-local guesses are forbidden |
| `share_story`, `deep_talk` | Disable from automatic claiming until a named persisted, server-verified conversation-classification event exists |

The migration keeps disabled catalog rows visible but unclaimable and documents
their disposition. Tests enumerate all 20 codes and specifically prove
`fed_tuna` is claimable after a feed while `fed_mira` is never queried or stored.

### Step 3: Remove caller-authoritative APIs

Delete the generic `/api/v1/mira/xp` mutation and `useAwardXp`. Replace
`/achievements/unlock` with POST `/achievements/claim`; its request has no
achievement code and claims all currently eligible achievements. Rename the
hook accordingly. For the migration inventory, remove the old manifest IDs for
`mira/xp`, `mira/achievements/unlock`, `mira/focus/complete`, and
`mira/pet/feed`; add/refresh the first-class IDs for `achievements/claim`,
`focus/complete`, and `pet/feed` in `route-overrides.json`, then regenerate the
manifest. There must be no stale legacy source-file ID or generated wrapper.

### Step 4: Route legitimate event sources through the boundary

Update feed, focus completion, and Tasks completion to call the server-only,
actor-bound event operations. Preserve their existing public success shapes.
`MiraClient.handleFeed` must call `crypto.randomUUID()` once per click and pass
that value to `feedMutation.mutate({ eventId })`; the hook's mutation function
must forward the supplied value so TanStack Query retries reuse it. Do not
generate it inside `mutationFn` or retain one shared UUID in hook closure.
Every partial failure must roll back the reward/statistics event or surface a
retryable durable state; do not retain log-and-continue XP drift.

## Test plan

pgTAP covers revoked grants, anonymous/authenticated direct execution, forged
user/session/task IDs, duplicate event keys, concurrent duplicate claims,
condition-false achievements, and atomic rollback. Route tests cover arbitrary
XP/code rejection, correct actor propagation, legitimate feed/focus/task events,
replay, foreign objects, and database failures. Search coverage proves no
browser or session client calls a generic award function.

## Done criteria

- [ ] Users cannot submit an XP amount, source, achievement result, or target user.
- [ ] Public/anon/authenticated roles cannot execute privileged Mira reward functions.
- [ ] Legitimate event rewards are actor-bound, atomic, and idempotent.
- [ ] Generic route/function callers are gone and migration metadata is current.
- [ ] Focused tests, reset/typegen, route/migration/backend gates, typechecks,
      builds, repository gate, and whitespace pass.

## STOP conditions

Stop if G22 ownership remains active, a catalog condition has no authoritative
server-side source, product requires repeatable rewards without a stable event
identity, historical reward rows require operator disposition, or backend
runtime coverage shows either mutation is already claimed instead of falling
through to live Web.

## Maintenance notes

New Mira rewards require a named persisted event and a database-enforced replay
key. UI checks may explain eligibility but can never authorize an award.
