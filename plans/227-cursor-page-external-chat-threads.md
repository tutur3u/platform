# Plan 227: Cursor-Page External Chat Threads with Set-Based Summaries

> **Executor instructions:** Replace the all-history JSON aggregate with one
> bounded keyset page contract and compute latest-message/count summaries only
> for that page. Preserve filters and thread JSON fields.
>
> **Drift check (run first):**
> `git diff --stat 968bd12018..HEAD -- apps/infrastructure/src/lib/ai-agents/external-chat-mirror.ts apps/infrastructure/src/lib/ai-agents/external-chat-mirror.test.ts 'apps/infrastructure/src/app/api/v1/infrastructure/ai-agents/external-threads/route.ts' 'apps/infrastructure/src/app/api/v1/infrastructure/ai-agents/external-threads/route.test.ts' packages/internal-api/src/infrastructure packages/ui/src/components/ui/chat/chat-agent-details-external-thread-panel.tsx packages/ui/src/components/ui/chat/chat-agent-details-external-thread-panel.test.tsx apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the active Zalo external-chat handoff claims
  the route, mirror, UI, internal-api, database, and generated types
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** performance / pagination / tests
- **Depends on:** Plans 154 and 163; exact-path transfer from the Zalo handoff
- **Planned at:** commit `968bd12018`, 2026-08-11

## Why this matters

The list RPC aggregates every matching thread into one JSON value, bypassing
PostgREST's row cap. Rendering each thread also runs separate latest-message and
count subqueries. Every operator refresh therefore grows with complete retained
history and the UI renders the full result.

## Current state and exact contract

- Migration `20260531174500_add_ai_agent_external_chat_mirror.sql:154-193`
  derives latest message and count with two correlated message queries per
  thread. Lines 396-417 `jsonb_agg` all filtered threads without a bound.
- The route/internal API expose only `agentId`, `channelId`, and `wsId`; the
  panel maps every returned row.
- Add `private.ai_agent_external_list_threads_page(p_agent_id text default
  null, p_channel_id text default null, p_ws_id uuid default null, p_limit
  integer default 50, p_cursor_event_at timestamptz default null, p_cursor_id
  uuid default null) returns jsonb`. Accept limits 1..100 and require both cursor
  fields together. Revoke/grant the exact signature for service role only.
- Order by `(coalesce(last_event_at, updated_at, created_at), id) DESC`. The
  effective timestamp is non-null because `updated_at` and `created_at` are
  non-null. Encode the cursor as base64url JSON `{v:1,t:<ISO>,id:<UUID>}` and
  validate it strictly in route and typed client. Fetch `limit + 1`, return
  `{threads,nextCursor}` with no duplicates/omissions under timestamp ties.
- Select the page first, then compute latest message and message count set-wise
  for only those thread IDs (for example `DISTINCT ON` plus grouped counts).
  Preserve every `AiAgentExternalThread` field and filter meaning.
- Keep the old private RPC temporarily only for internal migration compatibility
  if a current caller inventory finds one; no live route/UI may call it after
  this plan. Do not execute Plans 226 and 227 concurrently; rebase the second
  migration on the first if both are ready.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, `$vercel-react-best-practices`, and
`$tuturuuu-commit`. Execute from completed Plan 163 after Plan 154 is green.
Require exact-path transfer from the Zalo handoff and coordinate migration order
with Plan 226.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route/mirror/UI | `bun --cwd apps/infrastructure vitest run src/lib/ai-agents/external-chat-mirror.test.ts 'src/app/api/v1/infrastructure/ai-agents/external-threads/route.test.ts' && bun --cwd packages/ui vitest run src/components/ui/chat/chat-agent-details-external-thread-panel.test.tsx` | cursor/filter/invalid/tie/load-more contracts pass |
| Focused database + typegen | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/private-schema-external-chat-thread-pagination.sql --typegen packages/types/src/supabase.ts` | bounded page, summaries, ACLs, and types pass |
| Full database | `bun --cwd apps/database sb:validate:isolated` | full pgTAP baseline passes |
| Types | `bun run --cwd packages/internal-api type-check && bun run --cwd packages/ui type-check && bun run --cwd apps/infrastructure type-check` | exit 0 |
| Build | `bun run --cwd apps/infrastructure build` | production build exits 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** additive page RPC/migration/pgTAP/types; Infrastructure mirror and
GET route; internal-api page types/client; external-thread panel bounded paging;
focused tests.

**Out of scope:** send/replay safety (Plan 226), message-history pagination,
sync behavior, provider adapters, inbound persistence, changing filters/thread
fields, Rust, or deleting the old RPC without complete caller proof.

## Steps

1. Add red pgTAP and TypeScript tests for empty/single/multiple pages, 101+
   rows, identical effective timestamps, all filters, malformed/partial cursor,
   bounds, latest-message/count accuracy, and exact envelope compatibility.
2. Add the private service-role page RPC and index ending in `id`; select the
   page before set-based message summaries. Add signature-specific ACL tests.
3. Strictly parse/encode the versioned cursor in one shared server/client
   contract. Map invalid cursor/limit to 400 before RPC; map data failure to the
   existing 500 envelope.
4. Update internal API and panel to consume `{threads,nextCursor}` with a
   bounded initial page and explicit/infinite load-more behavior. Do not fetch
   subsequent pages when the selected thread is already known.
5. Run focused/isolated/full DB/typegen/typecheck/build/repository/whitespace and
   exact-scope gates.

## Done criteria

- [ ] Every list request returns at most 100 threads with stable keyset paging.
- [ ] Latest-message and count work is set-based and restricted to the page.
- [ ] Filters and every existing thread field remain compatible; invalid
      bounds/cursors fail as 400.
- [ ] Focused/full pgTAP, ACLs, typegen, route/UI tests, typechecks, build,
      repository, and whitespace gates pass.

## STOP conditions

Stop on active ownership, non-green Plan 154 baseline, nullable effective sort
key, an unaccounted old-RPC caller, inability to preserve thread JSON/filter
semantics, concurrent migration edits from Plan 226, or any mandatory gate
failing twice.
