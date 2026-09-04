# Plan 134: Bound Chat and Meet Realtime Lifecycle State

> **Executor instructions:** Use Plan 133's transport seams to evict empty
> rooms, bound Chat subscriber buffering, and stop Meet maintenance work for
> inactive rooms without changing the wire protocol or Durable Object model.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/chat-realtime/src apps/chat-realtime/tests apps/meet-realtime/src/server.ts apps/meet-realtime/src/room-state.ts apps/meet-realtime/tests apps/meet-realtime/README.md packages/realtime/src/meet plans/133-enroll-chat-meet-realtime-verification.md tmp/agent-coordination`
> Package realtime and the Plan 133 file are read-only evidence. Stop on
> protocol, persistence, ownership, or lifecycle-test drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / correctness
- **Depends on:** Plan 133
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Chat retains every observed workspace room and has no explicit slow-subscriber
queue policy. Meet retains every historical call room and sweeps/broadcasts it
every ten seconds forever. Process memory and recurring maintenance work grow
with historical usage, while a slow Chat client can accumulate unbounded SSE
delivery pressure.

## Current state

- Chat `server.ts:27-60` creates module-global rooms; failed enqueue deletes a
  client through `getRoom`, which can recreate a missing room, and never deletes
  an empty room.
- Chat cancellation similarly removes the client but preserves the room; send
  always enqueues without inspecting backpressure.
- Meet `room-state.ts:19-31` creates global rooms with no deletion helper.
- Meet `server.ts:135-140` sweeps every room every ten seconds; close removes a
  socket and releases a participant but never retires the final empty room.
- Meet also has a Durable Object transport with persisted state. This plan
  changes only the Bun/Docker room lifecycle; it must not silently impose the
  same eviction contract on the Durable Object.

## Required skills and preflight

Load `$systematic-debugging`, `$tuturuuu-platform`, and
`$tuturuuu-agent-coordination`. Plan 133 must be DONE and its direct/root suites
green before changing behavior. Read the completed Meet Cloudflare design note
and preserve reconnect/admission semantics.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Chat lifecycle | `bun --cwd apps/chat-realtime vitest run tests/server.test.ts tests/lifecycle.test.ts` | eviction/backpressure/reconnect cases pass |
| Meet lifecycle | `bun --cwd apps/meet-realtime vitest run tests/server.test.ts tests/lifecycle.test.ts` | expiry/multi-socket/reconnect/timer cases pass |
| Typechecks | `bun run --cwd apps/chat-realtime type-check && bun run --cwd apps/meet-realtime type-check` | both exit 0 |
| Docker contract | `node --test scripts/check-docker-web.test.js && node scripts/check-docker-web.js` | unchanged production wiring passes |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** Chat server plus lifecycle test; Meet Bun server/room-state plus
lifecycle test; Meet README only to document the chosen inactive grace period;
README status.

**Out of scope:** packages/realtime protocol/reducers, Meet Durable Object,
Cloudflare alarms/storage, token format, SFU behavior, ports, Docker/Compose,
horizontal scaling, Redis, client UI, and deployment.

## Git workflow

Use `perf/bound-realtime-lifecycle`, run `bun setup`, and commit
`perf(realtime): bound room lifecycle state`. Claim/release the commit window;
do not push unless instructed.

## Steps

### Step 1: Define measurable lifecycle invariants

In tests, require Chat room count to return to zero after the last cancel or
failed enqueue, and require stale cleanup never to recreate a room. Define a
64 KiB byte queue for Chat by constructing the stream with
`ByteLengthQueuingStrategy({ highWaterMark: 65_536 })`; if `desiredSize` is
already non-positive before the next enqueue, close/detach that subscriber so
the client can reconnect/refetch. For Meet, choose and document a short inactive
grace period that starts only after the final socket; rooms with waiting/active
sockets cannot expire.

**Verify:** new tests fail against the current permanent-room/no-backpressure
behavior and assert exact fake-clock boundaries.

### Step 2: Add a non-recreating Chat registry boundary

Centralize attach, detach, lookup, count, and reset-for-test. Detach deletes the
room only when empty and never calls the creating lookup. Use the byte-length
queue strategy and controller `desiredSize`; on the first attempted enqueue
after the queue reaches its high-water mark, close/error the stream, clear the
heartbeat, and detach once.
Late cancel/error must be idempotent and must not erase a newly reconnected
client.

**Verify:** Chat suite proves final-client eviction, failed-send eviction,
overflow disconnect, under-budget delivery, reconnect, idempotent late cleanup,
and timer disposal.

### Step 3: Add bounded Meet inactivity and interval ownership

Record inactivity after final socket/release, cancel it on reconnect, and evict
only after the documented grace period and safe empty-state predicate. The
sweep must delete expired rooms rather than broadcast to them. Make interval
ownership reference-counted or server-instance-owned so repeated construction
does not multiply sweep timers and stop disposes the final timer.

**Verify:** Meet suite covers multiple sockets, reconnect-before-expiry,
expiry-after-final-close, waiting/active protection, no broadcasts after
eviction, repeated stop, and no duplicate intervals.

### Step 4: Run all gates

Run both suites/typechecks, Docker contract, `bun check`, and whitespace.

## Done criteria

- [ ] Empty Chat rooms are removed without a creating lookup.
- [ ] Chat slow subscribers have a tested bounded overflow policy.
- [ ] Meet historical rooms expire only after final-socket grace and safe state.
- [ ] Meet maintenance intervals have deterministic start/stop ownership.
- [ ] Wire protocol, Durable Object, focused, Docker, repo, and whitespace gates pass.

## STOP conditions

Stop if Plan 133 is not DONE, eviction would discard state required for an
authorized reconnect, Bun cannot expose a reliable backpressure/queue measure,
the policy requires protocol/UI changes, Durable Object behavior must change,
or a gate fails twice.

## Maintenance notes

Treat reconnect as recovery from durable application state, not a reason to
retain process rooms forever. Measure production overflow/expiry rates before
tightening thresholds.
