# Plan 266: Commit Mail Inbound Message Graphs Atomically

> **Executor instructions:** Persist each inbound Mail message, recipients,
> attachment metadata, stored-object links, inbox label, thread counters, and
> optional auto-draft job in one idempotent transaction so either transport can
> retry without stranding an incomplete message.

> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/mail/src/lib/mail/inbound/ingest.ts apps/mail/src/lib/mail/inbound/ingest.test.ts apps/mail/src/lib/mail/inbound/cloudflare.ts apps/mail/src/lib/mail/inbound/cloudflare.test.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / inbound email persistence
- **Depends on:** Plans 009/154/163; Mail and database/type ownership transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Both SES and Cloudflare ingestion insert the message first, then perform
recipient, attachment, stored-object, label, thread-update, auto-draft, and job
settlement writes separately, frequently without inspecting their errors. A
failure can leave a message that claims attachments but has no metadata, lacks
recipients or its inbox label, or has stale thread counters. Provider delivery
and cross-provider Internet Message-ID identities are unique, so retry must
repair rather than collide with or double-count the partial message.

## Exact transaction contract

Add one signature-stable private RPC:

`private.ingest_mail_message_graph(p_mailbox_id uuid, p_thread_id uuid,
p_raw_message_id uuid, p_provider text, p_provider_message_id text,
p_message jsonb, p_recipients jsonb, p_attachments jsonb,
p_stored_object_ids uuid[] default null, p_enqueue_auto_draft boolean default
false, p_now timestamptz default clock_timestamp())
returns uuid`.

The service-role-only RPC must:

- accept only these `p_message` keys: `body_html`, `body_text`,
  `delivery_route`, `envelope_from`, `envelope_to`, `from_address`, `from_name`,
  `has_attachments`, `in_reply_to`, `ingress_domain_id`,
  `internet_message_id`, `observed_recipient`, `references_headers`,
  `sanitized_html`, `snippet`, and `subject`; the RPC owns `direction =
  'inbound'`, `status = 'received'`, identity columns, and `received_at = p_now`;
- accept only `address`, `display_name`, and `kind` in each recipient, and only
  `content_id`, `content_type`, `disposition`, `filename`, `size_bytes`, and
  `stored_object_id` in each attachment; reject every unknown key;
- verify the thread belongs to the mailbox, verify the raw-message row exists
  and matches the supplied provider/delivery identity, and lock the thread row;
  raw messages have no mailbox column and SES intentionally reuses one raw row
  across all matched mailboxes, so do not invent a raw-message co-tenancy rule;
- look up and lock by `(mailbox_id, provider, provider_message_id)` first, then
  by `(mailbox_id, internet_message_id)` when the latter is non-null, preserving
  the existing SES-to-Cloudflare cross-transport dedupe contract;
- insert only when neither identity exists; on Internet Message-ID replay,
  preserve the original parent `provider`, `provider_message_id`,
  `raw_message_id`, thread, and counter identity;
- on replay, replace recipients, attachment metadata, and the inbox label from
  the same canonical payload inside the transaction;
- link every supplied stored object only when it is unclaimed or already linked
  to this mailbox/message; reject cross-message/cross-mailbox reassignment;
- increment `message_count`/`unread_count` and update `last_message_at` only
  when the message is newly inserted;
- upsert the auto-draft job only when requested; and
- return the one message id or roll back every graph write.

Revoke the exact function signature from `PUBLIC`, `anon`, and `authenticated`;
grant only `service_role`. The TypeScript caller must inspect RPC errors and
must mark the inbound job `imported` only after every matched mailbox graph and
the final job update succeed.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Execute from the
completed Plan 163 isolated-validation base only after Plan 154 is green and
Plan 009/Mail plus database/type owners transfer the exact paths. Audit existing
partial provider-identity rows before adding replay repair semantics.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused Mail | `bun --cwd apps/mail vitest run src/lib/mail/inbound/ingest.test.ts src/lib/mail/inbound/cloudflare.test.ts` | SES and Cloudflare new/replay/failure graph cases pass without live providers |
| Focused database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/mail-inbound-message-graph.sql` | pgTAP proves transaction, replay, counters, ACLs, and rollback |
| Full database/typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts` | full pgTAP passes and generated types reflect only the RPC |
| Mail checks | `bun type-check:mail && bun --cwd apps/mail run build` | types and real Next build pass |
| Repository | `bun check && git diff --check` | all checks and whitespace pass |

## Scope

In scope: one additive private migration/RPC and pgTAP file; generated DB types;
the shared inbound graph writer; SES and Cloudflare callers/tests; stored-object,
auto-draft, and exact job settlement needed for truthful success.

Out of scope: SES signature/S3 authenticity owned by Plan 009, mailbox routing,
raw object deletion, provider configuration, attachment-byte storage, outbound
mail, counter schema redesign, and production migration application.

## Steps

1. Characterize SES and Cloudflare new-message success, same-provider replay,
   SES-to-Cloudflare Internet Message-ID replay, and injected failures at
   recipients, attachments, stored objects, label, thread, auto-draft, and job
   settlement. Prove the current partial-state windows red.
2. Add the RPC with signature-specific ACLs, closed JSON validation, co-tenancy,
   thread locking, new-versus-replay handling, and exactly-once counter updates.
3. Replace both transports' per-table graph writes with one awaited RPC. Pass
   Cloudflare raw/attachment/body stored-object IDs and compute its auto-draft
   decision before the call. Fetch or return the typed message only after the
   graph commits; inspect each transport's final job update and fail closed if
   it does not settle.
4. Add pgTAP for new insert, same-provider and cross-provider replay repair, two
   concurrent identical deliveries, invalid recipient/attachment rollback,
   stored-object reassignment rejection, cross-mailbox rejection, one-time
   counters, auto-draft idempotency, and function privileges.
5. Run focused Mail, focused/full isolated database/typegen, build, repository,
   whitespace, migration-manifest, and exact-scope gates.

## Done criteria

- [ ] A successful SES or Cloudflare result always has a complete message graph and truthful job state.
- [ ] Same-provider and Internet Message-ID replay repair compatible partial rows without changing original identity or double-counting.
- [ ] Only service role can execute the private RPC.
- [ ] Focused Mail, pgTAP, full isolated typegen, build, repository, and scope gates pass.

## STOP conditions

Stop on pre-existing incompatible duplicate identities; inability to distinguish
new from replay for counter settlement; ambiguous mailbox/thread/raw-message
ownership; Plan 009 or Mail/database/type ownership not transferred; generated
type drift beyond the RPC; an exact-base full database failure; or any mandatory
gate failing twice.
