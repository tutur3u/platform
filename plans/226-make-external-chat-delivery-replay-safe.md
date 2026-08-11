# Plan 226: Make External Chat Delivery Replay-Safe

> **Executor instructions:** Put manual and automatic external-chat replies
> behind one durable at-most-once operation boundary. Never report a safely
> retryable failure after provider acceptance, and never send a second failure
> message after a reply may already have been delivered.
>
> **Drift check (run first):**
> `git diff --stat 968bd12018..HEAD -- apps/infrastructure/src/lib/ai-agents/external-chat-actions.ts apps/infrastructure/src/lib/ai-agents/external-chat-actions.test.ts apps/infrastructure/src/lib/ai-agents/runtime.ts apps/infrastructure/src/lib/ai-agents/runtime.test.ts 'apps/infrastructure/src/app/api/v1/infrastructure/ai-agents/external-threads/[threadId]/send' packages/internal-api/src/infrastructure packages/ui/src/components/ui/chat/chat-agent-details-external-thread-panel.tsx packages/ui/src/components/ui/chat/chat-agent-details-external-thread-panel.test.tsx apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the active Zalo external-chat handoff claims
  every runtime, UI, internal-api, and database surface in this plan
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / external side effects / tests
- **Depends on:** Plans 154 and 163; exact-path transfer from the Zalo handoff
- **Planned at:** commit `968bd12018`, 2026-08-11

## Why this matters

Manual and automatic replies call Discord/Zalo before durable settlement. If
provider delivery succeeds and message persistence fails, the API returns 500
and an operator retry can duplicate the external message. The automatic path
can compound this by posting a second failure notice after the successful reply
was already accepted.

## Current state and exact contract

- `external-chat-actions.ts:170-198` posts first and then persists the provider
  message. The send route accepts only `content` and maps every exception to 500.
- `runtime.ts:554-589` follows the same order. Its catch block posts a provider-
  visible failure message whenever `shouldRespond`, even if the first response
  was already accepted and only persistence failed.
- The provider SDK exposes no repository-level idempotency-key contract. Do not
  promise exactly-once delivery. Enforce **at-most-once dispatch per operation**
  and expose post-dispatch uncertainty for reconciliation rather than resending.
- Add `private.ai_agent_external_delivery_operations` keyed by caller-supplied
  UUID, bound to thread, content hash, source (`manual`/`automatic`), actor or
  triggering external message, and states `pending`, `dispatching`, `delivered`,
  `ambiguous`, `failed_pre_dispatch`. Record attempts, lease timestamps, the
  provider message ID/result when known, safe error code, and timestamps. A
  repeated UUID with different thread/content/source is a conflict.
- Add signature-specific private service-role RPCs to begin/claim and settle an
  operation. Revoke from `PUBLIC`, `anon`, and `authenticated`; grant only
  `service_role`. Mark dispatching immediately before the provider call. Once
  dispatch may have begun, expiry/failure becomes terminal `ambiguous` and must
  never auto-dispatch again. Pre-dispatch failure may be claimed again.
- Manual request body becomes `{content, operationId}`. Return a closed result:
  delivered new `201`, delivered replay `200`, pending/dispatching/ambiguous
  `202`, mismatched reuse `409`, validation `400`, authorization unchanged.
  UI creates one UUID per deliberate send and retains it through retry/result.
- Automatic replies derive a stable operation UUID from adapter, channel,
  external thread, and triggering external message ID. After provider
  acceptance, persistence/settlement failure records ambiguity and must not send
  the generic failure reply. A failure message is allowed only when the primary
  operation proves dispatch never began.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, `$vercel-react-best-practices`, and
`$tuturuuu-commit`. Read root instructions and the external-chat pgTAP/runtime
tests. Execute from the completed Plan 163 isolated-typegen base after Plan 154
is green. Do not start until
`tmp/agent-coordination/20260719-120000-codex-zalo-chat-production.md` transfers
all exact paths. Do not expose provider credentials or raw messages in tests.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused runtime/route/UI | `bun --cwd apps/infrastructure vitest run src/lib/ai-agents/external-chat-actions.test.ts src/lib/ai-agents/runtime.test.ts 'src/app/api/v1/infrastructure/ai-agents/external-threads/[threadId]/send/route.test.ts' && bun --cwd packages/ui vitest run src/components/ui/chat/chat-agent-details-external-thread-panel.test.tsx` | pre/post-dispatch, replay, mismatch, overlap, and auto-response cases pass |
| Focused database + typegen | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/private-schema-external-chat-delivery-operations.sql --typegen packages/types/src/supabase.ts` | migration, ACLs, claims, settlement, and generated types pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | full pgTAP baseline passes |
| Package/app types | `bun run --cwd packages/internal-api type-check && bun run --cwd packages/ui type-check && bun run --cwd apps/infrastructure type-check` | exit 0 |
| Build | `bun run --cwd apps/infrastructure build` | production build exits 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** additive delivery-operation migration/pgTAP/types; external-chat
manual action/route; automatic response state machine; internal-api send
contract; panel operation identity/status UX; focused tests.

**Out of scope:** inbound dedupe, provider-history import, media storage,
pagination (Plan 227), changing AI response content/model, provider credentials,
Rust routes, or claiming exactly-once provider delivery.

## Steps

1. Characterize provider/post/persistence order with injected seams. Add red
   tests for failure before dispatch, provider rejection, provider success then
   persistence/settlement failure, same-operation overlap/replay, changed-
   payload reuse, lease expiry, and automatic reply persistence failure.
2. Add the operation table and private begin/claim/settle RPCs with content-
   binding, at-most-once state transitions, explicit ACLs, safe error codes, and
   indexes for reconciliation. pgTAP must prove concurrent claims yield one
   dispatch owner and post-dispatch expiry cannot be reclaimed.
3. Route manual sends through the operation boundary. Atomically persist the
   normalized provider message and delivered settlement when possible; classify
   any post-dispatch uncertainty as `202 ambiguous`, never 500/retryable.
4. Give automatic replies deterministic operation IDs and stage-aware error
   handling. Never post the generic failure response after dispatch began.
5. Update typed client/UI to retain one UUID per deliberate send, render
   delivered/in-progress/ambiguous outcomes, and avoid generating a new UUID on
   retry of the same action. Add English/Vietnamese strings and sort if needed.
6. Run focused/isolated/full DB/typegen/typecheck/build/repository/whitespace and
   exact-scope gates.

## Done criteria

- [ ] Concurrent or repeated use of one operation ID causes at most one
      provider dispatch and changed-payload reuse conflicts.
- [ ] Provider acceptance followed by local failure is visible as ambiguous and
      is never automatically resent or reported as an ordinary retryable 500.
- [ ] Automatic response failure never emits a contradictory second message
      after the primary reply may have been accepted.
- [ ] Function ACLs, focused/full pgTAP, runtime/route/UI tests, typegen,
      typechecks, build, repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, a provider-specific change required outside the
declared adapter seam, inability to distinguish pre-dispatch from post-dispatch
failure, need to promise exactly-once delivery, non-green Plan 154 baseline,
credential exposure, or any mandatory gate failing twice.
