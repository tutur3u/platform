# Plan 323: Aggregate Mail Bootstrap Unread Counts Set-Wise

> **Executor instructions:** Replace bootstrap's per-mailbox message/state
> queries with one service-role-only grouped database operation while preserving
> every current inbox/unread exclusion.
>
> **Drift check (run first):**
> `git diff --stat b68f9f182d..HEAD -- apps/mail/src/lib/mail/repository/bootstrap.ts apps/mail/src/lib/mail/repository/bootstrap-unread.test.ts apps/mail/src/lib/mail/repository/search.ts apps/database/supabase/migrations apps/database/supabase/tests/private-schema-mail.sql packages/types/src/supabase.ts tmp/agent-coordination`
> Stop on unread semantics, Mail bootstrap, Plan 322, or database/type owner
> drift.

## Status

- **Execution status:** BLOCKED — sequence after Plan 322 and obtain Mail/database/type transfer
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / correctness / tests
- **Depends on:** Plan 322; Plan 154 green; completed Plan 163; Mail/database/type ownership transfer
- **Planned at:** commit `b68f9f182d`, 2026-08-12

## Why this matters

Bootstrap launches one full message search per mailbox. Each search can load
5,000 user-state rows and then issue a separate exact-count query, so initial
Mail latency and database work grow linearly with mailbox count and state
history.

## Current state and exact contract

- `apps/mail/src/lib/mail/repository/bootstrap.ts:23-49,207-211` maps every
  mailbox through `queryMailMessageRows` in `Promise.all`.
- `search.ts:111-118` loads up to 5,000 state rows per mailbox; lines 175-221
  then run a separate exact-count query.
- `bootstrap-unread.test.ts:5-31` freezes one resolver call per mailbox rather
  than a bounded query count.
- Preserve semantics exactly: count inbound messages only; exclude drafts and
  quarantined messages; exclude a user's archived/trashed state; unread means
  that user's state has no `read_at`, including no state row at all.
- Add `private.get_mailbox_unread_counts(p_user_id uuid, p_mailbox_ids uuid[])`
  returning `(mailbox_id uuid, unread_count bigint)`. The application deduplicates
  IDs before calling. Empty input returns zero rows; null IDs, duplicates after
  normalization, or more than 500 IDs raise `MAILBOX_UNREAD_INPUT_INVALID`.
  Every requested mailbox must have a `mail_mailbox_members` row for the user;
  otherwise raise `MAILBOX_SCOPE_MISMATCH`. Return one row for every requested
  mailbox, including zero counts.
- Implement the count set-wise using grouped joins/anti-conditions, not dynamic
  SQL or one query per ID. SECURITY DEFINER, fixed safe search_path, fully
  qualified names; revoke PUBLIC/anon/authenticated and grant service_role only.
- Do not change general message-search behavior in `search.ts`. Add an index
  only if `EXPLAIN (ANALYZE, BUFFERS)` on the pgTAP fixture proves the existing
  `(mailbox_id,status,created_at)` and `(user_id,mailbox_id)` indexes insufficient;
  record the plan comparison in the PR.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Database | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/private-schema-mail.sql --typegen packages/types/src/supabase.ts` | mixed-state, >5,000-row, scope, ACL, and input-bound cases pass |
| Typegen stability | `cp packages/types/src/supabase.ts /tmp/plan323-supabase.ts && bun --cwd apps/database sb:validate:isolated --test supabase/tests/private-schema-mail.sql --typegen packages/types/src/supabase.ts && cmp /tmp/plan323-supabase.ts packages/types/src/supabase.ts` | second generation is byte-identical |
| Mail tests | `bun --cwd apps/mail vitest run src/lib/mail/repository/bootstrap-unread.test.ts` | one-RPC and semantic mapping cases pass |
| Mail | `bun type-check:mail && bun --cwd apps/mail run build` | typecheck and app build pass |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Query/scope | `rg -n 'queryMailMessageRows' apps/mail/src/lib/mail/repository/bootstrap.ts; git status --short` | no bootstrap unread call remains; only in-scope paths changed |

## Scope

**In scope:** one additive Mail migration; Mail pgTAP extension; generated DB
types; `bootstrap.ts`; replacing `bootstrap-unread.test.ts` with one-RPC and
semantic coverage.

**Out of scope:** changing general search/pagination, thread counts, message
state writes, bootstrap response shape, Mail UI, new dependencies, or an index
without measured plan evidence.

## Git workflow

- Branch: `perf/aggregate-mail-unread-counts` in an isolated worktree; run
  `bun setup` immediately.
- Rebase after Plan 322 because both own the Mail migration/test/type lane; use
  `bun sb:new aggregate_mail_unread_counts` for a separate additive migration.
- Commit: `perf(mail): aggregate bootstrap unread counts`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

1. Extend pgTAP with two users/multiple mailboxes and read, unread, archived,
   trashed, draft, quarantined, outbound, missing-state, >5,000-state, empty,
   duplicate, null, >500, foreign-membership, and direct-ACL cases.
2. Implement the bounded set-based RPC and exact ACL/error contract. Review the
   query plan against current indexes; add only a proven needed composite index.
3. Regenerate types deterministically. Replace the bootstrap fan-out with one
   RPC, fail closed on query error, and explicitly map missing rows to zero only
   after the RPC's cardinality/scope contract is satisfied.
4. Rewrite the mock test to assert one RPC regardless of mailbox count, exact
   ID dedupe/bound behavior, zero mapping, and sanitized failure. Run all gates.

## Done criteria

- [ ] Bootstrap issues one unread-count RPC for 0–500 unique mailboxes and no
  per-mailbox message/state queries.
- [ ] Counts remain correct beyond 5,000 user-state rows and for every frozen
  inbox/state exclusion.
- [ ] Foreign/unbounded input fails closed and direct unprivileged execution is
  denied.
- [ ] pgTAP, typegen, Mail test/build, `bun check`, scope, and whitespace pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if Plan 322 is not integrated/rebased, unread semantics differ from the
frozen contract, the RPC cannot return explicit zero rows without dynamic SQL,
the query plan needs a broad table redesign, or an active owner has not
transferred the exact Mail/database/type paths.

## Maintenance notes

Any future mailbox folder/state semantics must update the RPC and its >5,000-row
fixture together. Keep the 500-ID ceiling aligned with the bootstrap contract.
