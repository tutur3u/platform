# Plan 272: Batch Mail AI-Label Context

> **Executor instructions:** Replace per-thread full-detail hydration with one
> mailbox-authorized, set-based latest-message context query. Preserve the
> classifier prompt/result and missing-thread behavior while proving a 50-thread
> request reads at most 500 compact message rows with constant query count.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/mail/src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/labels' apps/mail/src/lib/mail/repository apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — active Mail ownership plus database-migration
  and generated-type transfer are required
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / Mail / database / test coverage
- **Depends on:** Plans 154 and 163; exact Mail/database/type ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

One classification request accepts 50 thread IDs, then loads as many as 200
fully hydrated messages per thread. Every message fans out into state, label,
recipient, attachment, and optional raw-header reads even though the model uses
only the last ten messages' sender/body text. The maximum request can therefore
start tens of thousands of data operations before one model call.

## Current state and exact contract

- `suggestMailLabelsSchema` permits up to 50 thread IDs.
- The classification branch in the Mail AI-label route calls `getMailThread`
  concurrently for every ID and keeps only `.messages.slice(-10)` fields.
- `getMailThread` reauthorizes each thread, loads up to 200 messages, and calls
  `hydrateMailMessage` for every row. Hydration performs four related reads and
  optional raw-header access per message.
- Add private service-role-only RPC
  `private.mail_ai_label_thread_context(p_mailbox_id uuid, p_thread_ids uuid[])`
  returning rows with exactly `thread_id uuid`, `thread_subject text`,
  `message_id uuid`, `created_at timestamptz`, `from_name text`,
  `from_address text`, `message_subject text`, and `context_text text`. Compute
  `context_text` as `left(coalesce(body_text, snippet, ''), 3000)` in SQL so the
  route never transfers more than 3,000 context characters per message. Reject
  null/empty input, more than 50 IDs, duplicate-free cardinality above 50, and
  unknown mailbox. Normalize/deduplicate IDs in stable first-occurrence order.
- The RPC must first select every requested thread from
  `private.mail_threads` constrained by `mailbox_id`. If any requested ID is
  missing or foreign, raise `P0001` with `MAIL_AI_LABEL_THREAD_NOT_FOUND` and
  return no partial context. For each valid thread, use `row_number() over
  (partition by thread_id order by created_at desc, id desc)` and retain at
  most ten messages; return rows ordered by requested-thread ordinal, then
  message `created_at asc, id asc` so prompt order matches the current
  chronological last-ten behavior. Resolve each thread title in the route with
  the existing `resolveMailThreadSubject(thread_subject,
  newest_message_subject)` helper, including blank and `(no subject)` legacy
  fallbacks; do not invent an SQL-only subject rule.
- Revoke EXECUTE from PUBLIC, anon, and authenticated; grant only service_role.
  The route already calls `requireMailboxAccess` once before classification;
  keep that app-session actor/role boundary and call the RPC through the
  returned admin client. Map only the named not-found code to the existing 404
  `{error:'Thread not found'}`. Other database failures remain sanitized 500.
- Do not call `getMailThread`, `hydrateMailMessage`, state/label/recipient/
  attachment readers, or raw-header storage from the classification branch.
  Keep the `suggest_labels` branch and classification prompt/output unchanged.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Read Mail/database AGENTS and the Mail handoff. Execute from
the completed Plan 163 integration base only after Plan 154 becomes green and
the exact owners transfer. Do not contact a live model/provider in tests and do
not apply production migrations.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Mail route | `bun --cwd apps/mail vitest run 'src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/labels/route.test.ts'` | 1/50-thread, missing/foreign/error, prompt-order, and no-hydration cases pass |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/mail-ai-label-thread-context.sql` | bounds, top-ten/ties, tenant scope, ACL, and query shape pass |
| Full/typegen database | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts` | full pgTAP passes and generated RPC types update atomically |
| Mail | `bun run --cwd apps/mail type-check && bun run --cwd apps/mail build` | both exit 0 |
| Repository | `bun check && git diff --check` | canonical gates pass; whitespace output is empty |

## Scope

**In scope:** the AI-label route and one new colocated test; one narrow Mail
repository wrapper/type if useful; one additive private RPC migration and one
pgTAP file; generated database types.

**Out of scope:** label suggestion behavior, classifier/model choice, prompt or
response redesign, AI metering policy, thread-detail/list APIs, message
hydration behavior for other callers, attachment/raw-header access, Mail UI,
production migration application, or generalized Mail search.

## Steps

1. Add route tests with mocked authorized context/admin RPC and model. Cover
   stable dedupe, one and 50 threads, exactly ten chronological messages per
   thread under tied timestamps, blank/`(no subject)` thread fallback from the
   newest message, 3,000-character context truncation, missing/foreign thread
   404, RPC failure 500, unchanged prompt/result, and zero calls to
   `getMailThread`/hydration seams.
2. Add the exact private RPC and ACLs. Use one mailbox-scoped thread validation
   CTE plus one window-ranked message query; never return more than ten rows per
   requested thread. Add the index required by the verified query plan only if
   the existing `(thread_id, created_at)` index cannot support the deterministic
   `created_at,id` order.
3. Add pgTAP fixtures above ten messages, equal timestamps, 50 threads,
   duplicates, unknown/foreign IDs, empty/oversized input, and direct EXECUTE
   denial. Prove maximum returned rows is `10 * unique_thread_count` and every
   row belongs to the requested mailbox/thread set.
4. Replace only the classification branch's Promise fan-out with one RPC call
   and deterministic prompt grouping. Preserve `requireMailboxAccess`, label
   loading, model input, assignment filtering, apply behavior, and the
   `suggest_labels` branch.
5. Run focused/full database/typegen, Mail test/typecheck/build, repository,
   whitespace, and exact-scope gates.

## Done criteria

- [ ] A 50-thread classification request performs one authorized context read
      and returns at most 500 compact message rows without detail hydration.
- [ ] Missing or foreign threads preserve the non-enumerating existing 404;
      unclassified database failures are sanitized 500s.
- [ ] Latest-ten chronological prompt semantics and classifier/apply response
      contracts remain unchanged.
- [ ] RPC ACLs are service-role-only and focused/full DB, typegen, app, build,
      repository, and whitespace gates pass.

## STOP conditions

Stop on missing ownership transfer, Plan 154 not green, no deterministic
message tie-break key, a caller requiring the RPC to be authenticated-public,
prompt/AI-metering changes, live provider/database credentials, unexpected
generated-type drift beyond the RPC, or any mandatory gate failing twice.

## Maintenance notes

AI context readers should project only prompt fields and impose the model-side
bound in the database. Reusing a rich UI detail hydrator is not a safe shortcut
for batch inference.
