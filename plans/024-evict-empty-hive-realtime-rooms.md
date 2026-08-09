# Plan 024: Evict Empty Hive Realtime Rooms

> **Executor instructions:** Remove in-memory Hive room state and maintenance
> work when the last client disconnects. Preserve multi-client presence and
> reconnect behavior.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/hive-realtime/src/server.ts apps/hive-realtime/src/room-registry.ts apps/hive-realtime/tests`
> Stop on room lifecycle, presence, or server shutdown drift.

## Status

- **Execution status:** TODO
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** Performance / Realtime / Tests
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

Every distinct Hive server ID creates a permanent entry in a process-global
room map. The ten-second presence sweep scans those entries forever, including
rooms with no clients. The disconnect path cannot clean one up because its
final presence publication calls `getRoom()` and recreates missing state.

## Current state

- `apps/hive-realtime/src/server.ts:23-45` owns a process-global `rooms` map and
  an insert-on-read `getRoom()` helper.
- Lines 231-236 install a new interval for every server instance and scan every
  room every ten seconds; the timer is not retained for shutdown.
- Lines 267-271 remove the departing client and awareness entry but never delete
  the room, then publish presence through the creating lookup path.
- Existing tests cover token and protocol schemas only; no server/room lifecycle
  test protects disconnect, eviction, or maintenance behavior.
- Room state contains only connected sockets and ephemeral awareness; durable
  CRDT/world state is loaded from and persisted to the database separately.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Confirm no active
Hive realtime note owns the server lifecycle before editing.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun --cwd apps/hive-realtime vitest run tests/server-lifecycle.test.ts tests/protocol.test.ts` | last-client eviction and multi-client retention cases pass |
| Typecheck | `bun --cwd apps/hive-realtime run type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/hive-realtime/src/server.ts`
- A focused room-registry/lifecycle module under `apps/hive-realtime/src/`
- `apps/hive-realtime/tests/server-lifecycle.test.ts`

Do not change token verification, protocol schemas, persistence semantics,
presence TTL, wire payloads, or the service port.

## Git workflow

- Branch: `fix/hive-realtime-room-eviction` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(hive): evict empty realtime rooms`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Extract a testable room registry

Move room creation, lookup, client removal, awareness pruning, and iteration
behind a small injected registry. Distinguish a creating lookup used by open and
client messages from a non-creating lookup used by broadcast, maintenance, and
close. Keep the module server-private.

**Verify:** unit tests can inspect room count without exporting the process-wide
map or constructing a real network listener.

### Step 2: Evict on the last disconnect without recreating

On close, remove the socket and that user's awareness. If clients remain,
publish the updated presence to them. If none remain, delete the room and do
not call any helper that creates it. Make repeated close events harmless.

**Verify:** two clients retain the room after the first close; the final close
reduces room count to zero; the close path never recreates the room.

### Step 3: Own the maintenance timer lifecycle

Run presence pruning against existing rooms only. Retain the interval handle,
avoid installing duplicate maintenance loops for repeated server construction,
and clear the handle when the corresponding server stops. Keep the production
ten-second cadence while allowing a deterministic fake clock in tests.

**Verify:** fake-timer tests show empty registries remain empty, stale awareness
is removed only from active rooms, and create/stop cycles leave no live timer.

### Step 4: Run focused and repository gates

Run every table command. Confirm reconnecting after eviction creates a fresh
ephemeral room and still loads durable state through `handleSyncHello()`.

## Test plan

Use a fake registry, sockets, and clock for lifecycle behavior. Cover multiple
clients, last-client close, repeated close, stale awareness pruning, reconnect,
and server timer cleanup without binding a real port.

## Done criteria

- [ ] The last disconnect removes its room from memory.
- [ ] Presence publication never recreates an empty room.
- [ ] Active multi-client rooms preserve current presence behavior.
- [ ] Server construction and shutdown do not leak maintenance intervals.
- [ ] Focused tests, typecheck, `bun check`, and whitespace pass.

## STOP conditions

Stop if any unpersisted collaboration state lives only in `RoomState`, server
shutdown cannot be wrapped without changing the public service contract, or an
active Hive owner overlaps the lifecycle paths.

## Maintenance notes

Creation and observation must remain separate registry operations. Any future
per-room background work needs an explicit last-client teardown test.
