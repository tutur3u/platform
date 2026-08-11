# Plan 271: Contain Zalo Listener Callback Failures

> **Executor instructions:** Contain the complete async message and friend-event
> handler promise at the listener boundary. Record a sanitized listener error,
> preserve successful delivery and nested `waitUntil` behavior, and prove one
> failed event does not poison later events.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- packages/ai/src/chat-sdk/zalo-personal.ts packages/ai/src/chat-sdk/zalo-personal.test.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the active Zalo production handoff owns the
  exact adapter and test paths
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** correctness / provider listener / test coverage
- **Depends on:** exact-path transfer from the Zalo handoff
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The listener currently discards the outer promises returned by message and
friend-request handlers. Parsing or Chat SDK rejection becomes an unhandled
promise rejection instead of adapter state, which can terminate the listener
host or silently lose an event while health continues to show stale success.

## Current state and exact contract

- `packages/ai/src/chat-sdk/zalo-personal.ts:494-499` invokes
  `handleIncomingMessage` and `handleFriendEvent` with `void` and no rejection
  handler.
- Both handlers can throw synchronously during adapter parsing or reject while
  awaiting `chat.processMessage`. Only tasks passed to the nested `waitUntil`
  callback are currently caught.
- Add one private `dispatchListenerEvent` helper that accepts the handler
  promise (or a thunk so synchronous throws are included), catches every outer
  failure, logs one sanitized server error at error severity, and calls
  `setStatus({ lastError: sanitizedMessage })`. It resolves to `void`; listener
  callbacks never return an unobserved rejecting promise.
- Reuse or minimally generalize the module's existing
  `toSafePhoneSyncError` redaction contract for listener failures: redact
  token-like strings and `params=` values, collapse line breaks, and cap the
  result at 240 characters. Do not log raw provider event objects, message
  content, credentials, or stack traces.
- A failed event must not set `connected:false` or `running:false`, detach
  listeners, close the socket, or prevent the next event from dispatching.
  Successful `lastEventAt` updates and nested `waitUntil` error capture remain
  unchanged.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read the active Zalo handoff fully and obtain exact-path
transfer before creating a worktree. This plan has no route, schema, provider
configuration, UI, Rust, or migration-manifest change.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused adapter | `bun --cwd packages/ai vitest run src/chat-sdk/zalo-personal.test.ts` | parse/process failures are contained and later events still dispatch |
| AI package | `bun run --cwd packages/ai type-check` | exits 0 |
| Repository | `bun check && git diff --check` | canonical gates pass; whitespace output is empty |

## Scope

**In scope:** `zalo-personal.ts`; its existing focused test; one small private
sanitization/dispatch helper in that module if needed.

**Out of scope:** provider reconnection/backoff, history sync, delivery replay
safety (Plan 226), thread paging (Plan 227), Zalo credentials, status schema,
external-chat routes/UI, database state, or changing the Chat SDK.

## Steps

1. Extend the existing test harness so listener callbacks can be invoked and
   asynchronous completion observed without `unhandledRejection` escaping.
   Red-test adapter `parseMessage` throw, `processMessage` rejection for a
   normal message, the same rejection for a friend request, and a successful
   event immediately after each failure. Include token-like, `params=`, newline,
   and over-240-character errors and assert neither status nor logs expose them.
2. Add the one safe dispatch wrapper and route both listener callbacks through
   it. Catch synchronous and asynchronous errors, sanitize/cap the message,
   emit one `console.error` without raw event data, and update only `lastError`.
3. Retain tests for successful message/friend dispatch, listener status,
   `lastEventAt`, nested `waitUntil` rejection, connection lifecycle, and
   teardown. Assert no close/detach call occurs after a handler failure.
4. Run focused tests, package typecheck, repository check, whitespace,
   and exact-scope verification.

## Done criteria

- [ ] No listener callback can create an unhandled rejection from parsing or
      `processMessage`.
- [ ] A contained failure records a bounded sanitized `lastError` and error log
      without event/message/credential content.
- [ ] Later events still dispatch and successful/nested-task behavior remains
      unchanged.
- [ ] Focused/package/repository/whitespace gates pass with only the two
      scoped files changed.

## STOP conditions

Stop on missing ownership transfer, a required public status/API change, a
failure that originates in provider socket lifecycle rather than the callback,
need for durable database reconciliation, live provider credentials, or any
mandatory gate failing twice.

## Maintenance notes

Event-emitter callbacks are process boundaries. Every async callback must own
its complete promise, even when nested background work already has a separate
`waitUntil` catcher.
