# Plan 243: Validate and Claim Lead Follow-Up Email Before Delivery

> **Executor instructions:** Move the legacy lead follow-up handler first-class,
> bind its receiver to the route workspace, and claim each email durably before
> provider dispatch. A rejected target receives no email, and an uncertain
> delivery is never silently retried.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/[userId]/follow-up' 'apps/web/src/app/api/v1/workspaces/[wsId]/users/[userId]/follow-up' 'apps/contacts/src/app/[locale]/[wsId]/users/[userId]/follow-up' apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plans 154/163 plus G22 route-artifact,
  Contacts follow-up UI, and database/generated-type ownership must clear
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** security / tenant isolation / delivery idempotency
- **Depends on:** Plans 154 and 163; G22, Contacts, and database/type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The route authorizes against one workspace but loads the receiver by global ID
through the service role. It sends the email before `create_guest_lead_email`
checks guest status and workspace attendance, so a foreign or ineligible target
can receive mail and the route can then return 500. A retry may send the same
message again without a durable lead-email record.

## Current state and exact contract

- The live handler is
  `apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/[userId]/follow-up/route.ts`.
  Lines 37-52 check `create_lead_generations`; lines 103-110 select
  `workspace_users` by `id` only; lines 162-176 dispatch; lines 221-245 persist
  afterward and return 500 on RPC failure.
- `apps/database/supabase/migrations/20250929072433_lead_generation.sql:36-103`
  validates guest status and workspace attendance only while inserting the
  post-dispatch audit graph. Preserve its guest and threshold semantics.
- Move the handler to the matching first-class `apps/web/src/app/api/**` path,
  delete the generated wrapper and legacy implementation, refresh the matching
  TanStack migration override ID if one exists, and regenerate the manifest.
  Web remains the live API authority.
- Extend the request with required header `Idempotency-Key: <uuid>`. Update the
  sole maintained Contacts client to create one UUID per logical submission,
  retain it across transport/5xx retries of the unchanged payload, and replace
  it when any payload field changes or a known pre-dispatch failure is returned.
  Preserve the existing JSON body and successful response fields.
- Add private table `private.lead_follow_up_email_operations` with exact fields:
  `id uuid primary key`, `ws_id uuid not null`, `sender_id uuid not null`,
  `receiver_id uuid not null`, `request_hash text not null`, `recipient_email
  text not null`, `subject text not null`, `content text not null`, `post_id uuid`,
  `status text not null`, `provider_message_id text`, `provider_audit_id uuid`,
  `sent_email_id uuid`, `last_error_code text`, `claimed_at timestamptz not
  null`, `settled_at timestamptz`, and timestamps.
  Status is exactly `sending|sent|failed|ambiguous`; add checks and indexes on
  `(ws_id,receiver_id,created_at desc)` and unsettled status.
- Add service-role-only RPC
  `private.claim_lead_follow_up_email(p_operation_id uuid, p_ws_id uuid,
  p_sender_id uuid, p_receiver_id uuid, p_recipient_email text, p_subject text,
  p_content text, p_post_id uuid) returns table(operation_id uuid, claim_state
  text, provider_message_id text, provider_audit_id uuid, sent_email_id uuid)`.
  It locks an existing operation or inserts one, hashes the normalized immutable
  payload server-side, proves the receiver has `ws_id = p_ws_id`, proves the
  sender is a current workspace member, validates guest/attendance eligibility,
  and validates non-null `p_post_id` belongs to the same workspace. A new
  operation is stored as `sending` in the same transaction before the function
  returns `new`; existing terminal rows return `sent`, `failed`, or `ambiguous`.
  A `sending` row younger than exactly 10 minutes returns `in_progress`; at 10
  minutes it transitions to and returns `ambiguous`. The same key with a
  different hash raises `IDEMPOTENCY_CONFLICT`.
- Add service-role-only RPC
  `private.settle_lead_follow_up_email(p_operation_id uuid, p_state text,
  p_provider_message_id text, p_provider_audit_id uuid, p_error_code text)
  returns void`. Only `sending -> sent|failed|ambiguous` is accepted. A known provider
  rejection becomes `failed`; a thrown/aborted request or a successful provider
  call whose database settlement fails becomes `ambiguous`. `sending` claims
  at or beyond the exact 10-minute lease become `ambiguous`, never automatically
  resendable.
- On successful provider delivery, settle `sent` and create the existing
  `sent_emails` plus `guest_users_lead_generation` records transactionally in
  the same database call, using the immutable subject/content/post stored by
  the claim and source name/email resolved from the operation workspace rather
  than caller-supplied settlement data. Replayed `sent` operations return the
  stored IDs and current success envelope without dispatch. `in_progress`
  returns 409 with `Retry-After: 15`; `ambiguous` returns 409 with stable code
  `DELIVERY_STATUS_UNKNOWN`; `failed` returns the stored sanitized provider
  failure without dispatch. A deliberate retry after a known failure is a new
  logical submission with a new key. Never return raw database/provider details
  to the client.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from completed Plan 163 only after Plan 154 is green.
Obtain exact transfer for the Contacts client, G22 migration artifacts, and
database/type paths. Never apply production migrations or send a real email in
verification.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Web route | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/users/[userId]/follow-up/route.test.ts'` | tenant, eligibility, claim, replay, and ambiguity cases pass with a fake email provider |
| Contacts client | `bun --cwd apps/contacts vitest run 'src/app/[locale]/[wsId]/users/[userId]/follow-up/client.test.tsx'` | one logical submission retains one idempotency key across retry |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/lead-follow-up-email-claim.sql && bun --cwd apps/database sb:validate:isolated` | target validation, state transitions, concurrency, ACLs, and full suite pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/lead-follow-up-email-claim.sql` | exact table/RPC types generated without unrelated drift |
| Route tracking | `bun web:api-routes:check && bun migration:tanstack:manifest && bun migration:tanstack:check` | first-class route and generated migration artifacts agree |
| Apps | `bun type-check:web && bun run --cwd apps/web build && bun type-check:contacts && bun run --cwd apps/contacts build` | typechecks and real builds exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** the exact follow-up route move and route test; Contacts follow-up
client idempotency wiring/test; one additive operation-table/RPC migration; one
pgTAP file; generated database types; required TanStack migration artifacts and
count documentation generated by the canonical commands. **Out of scope:**
other email routes/queues, recipient editing policy, email templates, global
rate-limit policy, provider replacement, production sends or migration apply,
and generic Contacts lead-generation UX redesign.

## Steps

1. Add red route tests proving a foreign, non-guest, and below-threshold target
   never reaches the provider; prove current post-dispatch RPC failure returns
   500 after one send; add replay, payload-conflict, in-progress, known-failure,
   and ambiguous-delivery cases with an injected provider.
2. Add a focused Contacts client test, then generate and retain one UUID for an
   unchanged logical submission. Send it as `Idempotency-Key`; clear or replace
   it only under the exact rules above.
3. Create the private operation table and the exact claim/settle RPCs with fixed
   `search_path`, closed state transitions, server-derived request hashing,
   workspace/eligibility checks, deterministic row locks, and the existing
   successful audit inserts. A successful claim must durably enter `sending`
   before returning to the route. Revoke table/function access from PUBLIC,
   `anon`, and `authenticated`; grant only `service_role`.
4. Verify the existing destination is only the generated POST re-export, remove
   that wrapper, then `git mv` the legacy `route.ts` into the now-empty
   first-class destination and create its colocated test there. Claim before any
   provider work, branch on the returned state, dispatch once only for `new`,
   and settle the exact outcome. Do not keep the current send-then-audit
   fallback.
5. Add pgTAP for same-workspace eligibility, foreign receiver/post, non-member
   sender, duplicate key/same hash, duplicate key/different hash, overlapping
   claims, every legal/illegal transition, stale `sending -> ambiguous`, sent
   audit atomicity, and ACLs. Use a deterministic two-session dblink barrier and
   release both connections before cleanup.
6. Regenerate isolated types and route-migration artifacts, update only their
   required canonical counts, then run focused tests, both app typechecks/builds,
   repository, source-size, whitespace, and exact-scope gates.

## Done criteria

- [ ] Foreign or ineligible targets cause zero provider calls and zero rows.
- [ ] One idempotency key can produce at most one provider dispatch.
- [ ] Sent replay returns the recorded result; in-progress or ambiguous work is
      never automatically resent.
- [ ] Successful provider delivery and legacy audit rows settle together, or
      the operation remains visibly ambiguous for reconciliation.
- [ ] The route is first-class, the operation boundary is service-role-only,
      and route manifests remain current.
- [ ] Focused/full DB, typegen, Web/Contacts tests, typechecks/builds,
      repository, and whitespace gates pass without a real email.

## STOP conditions

Stop on red Plan 154 baseline, unresolved G22/Contacts/database ownership,
another maintained caller that cannot supply a stable idempotency key, existing
cross-workspace lead or audit rows, provider APIs that cannot distinguish known
rejection from ambiguous dispatch, need to redefine guest/attendance policy,
production send/apply need, or any mandatory gate failing twice.
