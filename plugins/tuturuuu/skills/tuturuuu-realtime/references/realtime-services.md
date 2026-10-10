# Realtime service implementation

## Map ownership

- `packages/realtime/core/token.ts`: signed payload transport. Callers validate
  audience, expiry, kind and scope; a valid signature alone is insufficient.
- `packages/realtime/collaboration`: Yjs programming document and browser client.
  Files are a map of Y.Text values; commands are a separate Y.Text. Text updates
  replace differing spans, preserving concurrent operations.
- `apps/meet-realtime`: Meet signaling and collaboration Durable Objects. Worker
  routes verify capabilities before selecting a room namespace.
- `packages/storage-core`: personal Drive checkpoints and immutable manifests.
- `packages/meet-core`: admitted meeting access and resource selection.
- `packages/programming-ui`: shared Monaco workbench and transient presence.
- `packages/internal-api`: typed client requests; no app-local raw fetches.

## Authorize and reconnect

Resolve the actor with the satellite session helper, then authorize workspace or
personal-resource scope. Browser join tickets last 60 seconds and refresh at
45 seconds. A workspace UUID, selected file path, room name or email supplied by
a browser is not an authorization fact. Use current confirmed auth identity for
internal-host elevation. Only the host can change meeting programming selection.

Reconnect sends a state vector and any document updates missing from the server.
Do not mark a WebSocket send as an acknowledged durable save. Keep disconnected
state visible and distinguish shared-room persistence from a confirmed Drive
revision. A viewer must not emit mutation updates or run commands.

## Persist and control cost

Cursor/pointer movement must never update the Yjs document or trigger Drive
writes. Limit presence to ten updates per second. Coalesce document writes, cap
pending alarms so continuous typing cannot postpone checkpoints indefinitely,
and retry failed checkpoints with a bound. Compare snapshot hashes before
sending, then send changed file contents and a complete path inventory. Drive
uploads reuse unchanged object pointers. Ticket refresh must not download Drive
files once the room has been seeded.

Treat Drive conflicts as conflicts, not permission to overwrite another writer.
Environment-generated files and collaborative edits share one revision stream;
review their behavior when a command and an editor both change the same file.
Document limits and excluded dependency/cache directories explicitly.

## Verify and operate

Run focused protocol/document tests and app admission tests first. Replay schema
changes in a disposable stack. Require owning-app and worker CI validation before
shipping. Use `apps/docs/build/devops/programming-realtime-runbook.mdx` for env
configuration, failure diagnosis, capacity and worker migration order. Native
screen capture is independent of CRDT collaboration: mobile browsers without
getDisplayMedia can still view screens and edit the shared workbench.

## Local verification

Use `apps/meet-realtime/wrangler.jsonc` with `wrangler dev --local` to exercise
real Workers, Durable Objects, SQLite persistence and WebSocket upgrades.
Follow the commands, disposable fixtures, port ownership and cleanup in
`apps/docs/build/devops/programming-realtime-runbook.mdx#local-cloudflare-runtime-verification`.
The finite probe is `apps/meet-realtime/tests/programming-local-check.ts`.
Do not edit worker imports during its run or mistake hot-reload interruptions
for protocol failures. Record checkpoint fixtures separately from actual Drive
writes and SFU media checks. Wrangler does not emulate hosted SFU/TURN.

When a missing setup step or runtime mismatch blocks verification, fix and record
it in the owning runbook and this focused reference. Keep repository-wide local
verification expectations in AGENTS.md. Prefer the running Linux Docker daemon
for isolated Supabase fixtures; do not switch onto Docker Desktop or stop other
sessions' containers. Local dev bundling does not authorize production deploys.

## Web and mobile parity

Use `packages/realtime/channels` and `packages/realtime/documents` for shared
broadcast/presence and Yjs rich-text collaboration. The Internal API factory owns
client ticket/session requests. Supabase remains auth/database/storage; do not
use its realtime channel factory for new consumers. During the documented task
rollout, an authorized server-only dual-publish bridge preserves supported old
clients with the same private audiences; retire it only after the minimum
supported clients and join telemetry satisfy the runbook criterion. Native task channels implement the same wire
protocol, including authenticated in-place refresh and reconnect authorization.
Native Meet embeds the canonical web editors rather than converting Yjs updates
through a second rich-text implementation. Keep bridge actions room-scoped and
allowlisted; keep preview capabilities separate from bridge nonces and tokens.

Always exercise the real local channel, document and programming probes. Add
native protocol tests and browser/native acceptance for features crossing the
bridge. Caret identity and selected ranges need real editor regression coverage;
mocked transport alone does not verify them. See the runbook for fixture limits,
Cloudflare redirect semantics, bounded failed-checkpoint retries and native SDK
setup. Never claim native runtime parity solely from a passing web test.


Runner-created project files must enter the same durable programming document
before Drive persistence. Bind ingestion to the authorized run and runner, merge
against that runner's last acknowledged hashes, retain editor-only changes and
reject same-file conflicts. Never let a runner advance Drive independently of
room revisions. Verify retries and restart recovery, including atomic state and
metadata persistence.

Web and Dart channel validators share regression fixtures in
`packages/realtime/fixtures/channel-server-frames.json`. Keep validators and
fixtures in step; validate presence replay after reconnect and clearing after
untrack. An in-place refresh must retain the socket and avoid replaying a full
content snapshot.


For native capture without a hosted backend, Android CI provides the separate
`android-meet-capture-fixture-apk` artifact from `main_realtime_fixture.dart`.
It starts a capability-scoped loopback session/signaling backend and synthetic
SFU receiver, using the production native controller, signaling and media
publisher. The debug entrypoint skips accounts and production bootstrap. Require increasing
decoded frame counts, Stop/revoke cleanup and repeated-start evidence; a returned
track is insufficient. The fixture neither tests hosted SFU nor replaces native
WebView acceptance. See the runbook before installing/driving its exact-commit
artifact. Use T3 Device so verification remains visible to the user.

## Offline programming checkpoint retries

Persist the offline retry reservation before checkpoint I/O; never keep its
attempt count only in memory. Programming rooms allow three automatic offline
attempts within two minutes, separated by 30 seconds, retaining unresolved
documents on expiry/exhaustion. Successful owner-authorized checkpoints clear
the budget; viewer recovery remains forbidden. Recheck active connections after
awaited provider work so a concurrent join retains its expiry sweep.

Use `collaboration-retry-budget.test.ts` for counted duplicate/restart/deadline/
failure/recovery coverage and the isolated Worker/SQLite fixture documented in
`programming-realtime-runbook.mdx`. Distinguish explicit handler invocation and
stubbed provider failures from hosted alarm delivery and actual Drive saves.
This offline bound does not certify live retry, media cleanup or account spending.


The framework-independent `@tuturuuu/realtime/core/retry-budget` planner owns
finite attempt/deadline decisions; the Worker persists reservations before I/O
and retains authorization and recovery. Invalid durable retry state stops without
resetting the job or deleting documents. See
`apps/docs/build/devops/programming-realtime-runbook.mdx#portable-offline-retry-planning`
for the adapter contract and planner, counted-handler and SQLite regressions.

## Offline channel checkpoint reservations

Channel rooms persist a finite three-attempt, two-minute offline job before
callback I/O. Failed reservation writes must spend zero callbacks; failed completion
writes must not replenish persisted attempts. Keep 30-second minimum future
reservation deadlines, terminal-state stops and retained document bytes. Only an
authorized editor rejoin may reset a stopped job; viewer sockets and expired editor
tickets do not establish recurring checkpoint authority.

Use `channel-retry-budget.test.ts` for counted failures, duplicates, reconstruction,
clock boundaries and recovery. The isolated `test-fixtures/channel-retry` Worker
uses real SQLite and controlled callback/completion failures. Record written keys,
not just batched put calls. This finite offline budget does not certify hosted alarm
delivery, live lease renewal, independent stop or total account spend. Follow the
channel reservation verification section in the programming realtime runbook.

## Meet Live compensation after termination

Read the ended-session compensation section in
`apps/docs/platform/features/meet-live-assistants.mdx` before changing Live alarm
budgets. `session.ts` dispatches registry/room compensation and billing/context
finalization independently after `ended`; stopping provider output does not stop
all background obligations. The current cleanup helper arms before I/O and writes
completion flags afterward without a finite durable attempt reservation or expiry.
Registry failure or an ambiguous successful call can continue across restarts.

Require a joint operation envelope, pre-I/O durable reservation, finite deadline,
terminal pending state retaining unresolved obligations, authenticated recovery
and durable stop checks before dispatch/rescheduling. Count registry RPCs, room
requests, quota/usage calls, context-erasure work and written keys separately.
Test duplicate/restart/clock/no-progress cases, pre- and post-I/O write failures,
Stop/revocation races and real Worker/SQLite persistence. Do not truncate retries
by dropping quota reservations, private deletion obligations or billing receipts.
`session-cleanup.test.ts` covers independent compensation and confirmed completion,
not a finite job budget or hosted shutdown guarantee. Keep that limitation visible.

For Live context erasure, count the128-key page ceiling and each deleted archive
key rather than treating a batch delete as one billed key. Full pages schedule a
confirmation wake; failed deletion preserves the archive and can retry. Finalization
also writes session state in its public-settlement and final steps after erasure
completes. Count duplicate completion writes and require durable completion proof
before optimizing them away; memory-only flags may follow a failed durable write.

Public Live billing currently scans the complete saved map. Include quota settlement,
share completion, usage reporting, per-record writes and the final map write in the
wake budget. Count retry-scheduler calls separately from delivered alarms. Verify
quota progress survives usage failures, and successful reporting followed by a
failed final write remains recoverable across reconstruction. A page limit needs
a durable cursor and per-record progress; never truncate outstanding obligations.

For active Live registry renewal, test the exact 12-hour renewal and 23-hour failure
boundaries, duplicate/reconstructed calls, future persisted timestamps and Stop
while registration is in flight. The existing age check is a privacy lease guard,
not a finite attempt reservation. A future timestamp can suppress renewal beyond
the original lease; require validated clock state and bounded future deadlines.
Count registration and compensating removal RPCs separately, and retain failed
removal obligations. Controlled helper tests do not prove hosted discoverability,
real durable timestamp persistence or authenticated stop/reschedule fencing.

For Meeting media compensation, read the operation envelope in the programming
realtime runbook. Count legacy inventory, close and failed-close confirmation per
provider session, each track and each progress write. The helper traverses the
complete pending session set; repeated reconstruction and failed persistence can
repeat successful provider work. Counter saturation at 32 and hourly backoff do
not terminate the job, and new obligations can reset the delay. Preserve pending
tracks and confirmed-progress recovery while introducing a durable finite job
budget, bounded calls/body reads and authenticated stop/reschedule fences.
The SFU client awaits fetch and full text/JSON bodies without explicit deadlines
or byte bounds; trimming error details after `response.text()` does not bound the
read. A stalled promise prevents failure deferral and keeps standalone-server
cleanup marked in flight. Test stalled fetch/body, oversized response, clock
boundaries and ambiguous completion before accepting a deadline repair. Preserve
absence confirmation and fail-closed progress persistence; cancellation alone
cannot establish remote media shutdown.
Controlled helper counts exclude surrounding room storage/alarm operations and
do not prove hosted SFU shutdown or account-wide billing safety.

## Live registry clock integrity

Active Live renewal rejects nonfinite, negative, unsafe or future persisted clock
values before registration; renewal may not predate session admission. Preserve
this fail-closed behavior during clock rollback and route errors through the existing
session stop path without dropping cleanup or billing obligations. Ended-session
registry removal bypasses the active lease check. Keep the twelve-hour renewal and
twenty-three-hour failure boundaries, and verify them in `registry-heartbeat.test.ts`
alongside reconstruction, duplicate suppression and invalid-clock removal. This
clock fence does not replace finite compensation budgets or hosted stop evidence.
