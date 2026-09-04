# Plan 332: Contain and Sanitize Hive Realtime Handler Failures

> **Executor instructions:** Contain every asynchronous WebSocket handler
> rejection and return stable public error codes. Preserve successful snapshot,
> update, event, awareness, presence, room, and maintenance behavior.
>
> **Drift check (run first):**
> `git diff --stat f8fa36af4b..HEAD -- apps/hive-realtime/src/server.ts apps/hive-realtime/src/hive-db.ts apps/hive-realtime/src/protocol.ts apps/hive-realtime/tests/server-lifecycle.test.ts apps/hive-realtime/tests/protocol.test.ts tmp/agent-coordination`
> Stop on server callback, protocol-error, database-helper, or lifecycle-test drift.

## Status

- **Execution status:** TODO — no active exact-path owner
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** correctness / security / tests
- **Depends on:** none
- **Planned at:** commit `f8fa36af4b`, 2026-08-12

## Why this matters

The initial snapshot is launched without rejection handling, so a database
failure becomes an unhandled promise rejection and the connected client receives
no usable result. Later handler failures are caught but their raw exception
message is sent to the remote socket, exposing internal database/runtime detail.
Malformed JSON takes that same raw-error path. A single failed operation should
be observable, sanitized, and recoverable without terminating later messages.

## Current state and exact contract

- `apps/hive-realtime/src/server.ts:96-108` awaits
  `loadHiveCrdtSnapshot`; `src/hive-db.ts:62-75` can throw on a database error.
- `server.ts:285-294` invokes `void handleSyncHello(ws)` during `open` without
  a catch. The message callback catches `handleMessage` but sends
  `error.message` to the client.
- `handleMessage` calls `JSON.parse` before Zod `safeParse`, so malformed JSON
  rejects instead of using the existing `malformed_event` response.
- `packages/realtime/src/hive/index.ts:135-168` permits a string error code in
  `{ type: 'error', error }`; no shared protocol change is required.
- Freeze public codes: invalid JSON/schema is `malformed_event`; initial or
  explicit `sync.hello` snapshot-load failure is `sync_unavailable`; persistence
  failure for `sync.update`/`world.event` is `operation_failed`. Send one error
  frame per failed operation, never the thrown message/stack/payload/token.
- Keep the socket open. A later `sync.hello` must retry snapshot loading, and a
  later valid nonfailed message must still dispatch. Log one `console.error`
  with operation plus nonsecret server/user identifiers and error class/name;
  exclude client payload, token, exception message, and stack.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun --cwd apps/hive-realtime vitest run tests/server-lifecycle.test.ts tests/protocol.test.ts` | containment, sanitization, retry, and existing lifecycle cases pass |
| Raw-error absence | `rg -n 'error\.message|String\(error\)|unknown_error|void handleSyncHello\(ws\);' apps/hive-realtime/src/server.ts` | no matches |
| Typecheck | `bun --cwd apps/hive-realtime run type-check` | exits 0 |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only server/lifecycle test and plan status changed |

## Suggested executor toolkit

- Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`.
- Use the fake `Bun.serve` and socket harness already in
  `apps/hive-realtime/tests/server-lifecycle.test.ts`.

## Scope

**In scope:** `apps/hive-realtime/src/server.ts`, expanded
`apps/hive-realtime/tests/server-lifecycle.test.ts`, plan status.

**Out of scope:** protocol shape/package changes; database query/persistence
semantics; retries/backoff beyond a client sending another `sync.hello`; socket
close policy; CRDT/world payload bounds; room registry/maintenance; auth/token
format; new telemetry dependency; client UI changes.

## Git workflow

- Use branch `fix/hive-realtime-error-containment` in an isolated worktree and
  run `bun setup` immediately.
- Commit: `fix(hive): contain realtime handler failures`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

### Step 1: Extend the existing server harness

Capture the WebSocket callbacks from the fake `Bun.serve`. Add cases for:
malformed JSON; initial snapshot rejection; explicit `sync.hello` rejection then
success on retry; CRDT persistence rejection; world-event persistence rejection;
and a successful later message after each failure. Use unique synthetic internal
error text and assert it appears in no outbound frame or log argument.

**Verify:** Focused tests fail on the current uncontained/raw-message behavior.

### Step 2: Centralize safe dispatch failure handling

Catch JSON parsing locally and return `malformed_event`. Make the message
dispatcher retain enough operation context to map snapshot reads to
`sync_unavailable` and writes/events to `operation_failed`. Route both the open
callback and message callback through one contained async-dispatch helper that
sends the stable code and writes the bounded diagnostic described above.

Do not catch successful handlers, close the connection, mutate room state, or
retry automatically. Ensure `void` is applied only to a promise with a terminal
catch attached.

**Verify:** Focused tests and Raw-error absence pass.

### Step 3: Run package and repository gates

Run focused tests, typecheck, `bun check`, scope, and whitespace. Confirm
`server.ts` remains below 700 lines and no protocol/database file changed.

## Test plan

- Malformed JSON and schema-invalid JSON both produce exactly `malformed_event`.
- Initial/explicit snapshot failure produces exactly `sync_unavailable`, no
  unhandled rejection, and a same-socket retry can deliver a snapshot.
- Update/event failures produce exactly `operation_failed`; later messages work.
- Logs preserve severity and operation context but exclude secret payload/token,
  thrown message, and stack.
- Existing presence, eviction, snapshot reload, and shared-timer tests stay green.

## Done criteria

- [ ] No asynchronous WebSocket handler rejection is left uncontained.
- [ ] No raw exception message, stack, request payload, or token reaches a client or bounded diagnostic.
- [ ] Stable error codes distinguish malformed input, snapshot unavailability, and write failure.
- [ ] Failed operations leave the socket able to process a later valid message.
- [ ] Focused tests, typecheck, `bun check`, scope, LOC, and whitespace pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if clients rely on raw error messages; the shared protocol restricts the
specified codes; containment requires changing database semantics or closing
sockets; an active exact-path owner appears; or a required gate fails twice.

## Maintenance notes

Keep public WebSocket errors as stable codes. Add measured payload limits in the
separately deferred CRDT/world-boundary work rather than expanding this plan.
