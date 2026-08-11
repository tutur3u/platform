# Plan 172: Claim and Durably Settle Topic-Announcement Delivery

> **Executor instructions:** Route immediate and scheduled announcement sends
> through one atomic delivery state machine. Never auto-resend after dispatch may
> have reached the provider. Move every substantially changed legacy route
> first-class and run every gate.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements' 'apps/web/src/legacy-api-routes/cron/process-topic-announcement-queue' 'apps/web/src/app/api/v1/workspaces/[wsId]/topic-announcements' apps/web/src/app/api/cron/process-topic-announcement-queue packages/internal-api/src/topic-announcements.ts apps/contacts/src/app/'[locale]'/'[wsId]'/users/topic-announcements apps/contacts/messages apps/web/messages apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`
> Stop on delivery-contract, provider, route-artifact, database, message-bundle,
> or exact-path ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / performance / external side effects
- **Depends on:** Plans 154 and 163; G22, database/generated-type, and message-bundle ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Immediate single and bulk sends check status and call the email provider without
an atomic claim. Concurrent requests can deliver twice, and provider success
followed by a failed status update leaves the row resendable while the API
reports success. Bulk sending also performs as many as 50 complete provider
workflows, 2,500 sequential verification RPCs, and 250 serial attachment
downloads inside one HTTP request.

## Current state

- `.../announcements/[announcementId]/send/route.ts:34-42` calls
  `sendTopicAnnouncement` synchronously; `.../send-bulk/route.ts:34-47` does so
  serially for up to 50 IDs (`shared.ts:414-416`).
- `email.ts:159-170` reads a sendable row but does not claim it. Lines 96-139
  run one linked-email RPC per contact, lines 242-262 download attachments
  serially, and lines 275-322 send externally, ignore the final update result,
  and return success.
- `cron/process-topic-announcement-queue/route.ts:77-108` conditionally claims a
  queued row as `processing`, but lines 45-72 requeue stale processing rows.
  A crash after provider acceptance therefore remains duplicate-prone.
- The current status check allows only draft/queued/processing/sent/failed/
  skipped/cancelled. There is no durable attempt identity, dispatch marker, or
  terminal uncertain state.
- `packages/internal-api/src/topic-announcements.ts:403-420,528-548` types
  immediate provider results. Contacts is the sole reachable workspace-user CRM
  caller after reviewed Plan 197 commit `9747845aae`; the redirected TanStack
  component fork is not a supported delivery client.
- `email.ts` is also imported by untouched `server-helpers.ts`,
  `contacts/[contactId]/route.ts`, and `contacts/[contactId]/verify/route.ts`.
  Moving the implementation therefore requires a thin legacy compatibility
  re-export; do not strand those live contact/verification callers.
- Both send routes and the cron are generated legacy wrappers. No Rust handler
  implements delivery; migration tracking must remain `legacy-next` after their
  source files move.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused database/typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/topic-announcement-delivery.sql` | state-machine pgTAP passes and types regenerate from disposable stack |
| Full database | `bun --cwd apps/database sb:validate:isolated` | full suite exits 0 on Plan 154 baseline |
| Web delivery | `bun --cwd apps/web vitest run 'src/app/api/v1/workspaces/[wsId]/topic-announcements/announcements/[announcementId]/send/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/topic-announcements/send-bulk/route.test.ts' src/app/api/cron/process-topic-announcement-queue/route.test.ts 'src/app/api/v1/workspaces/[wsId]/topic-announcements/_shared/email.test.ts'` | claim, overlap, ambiguity, and replay cases pass |
| Internal API | `bun run --cwd packages/internal-api test -- src/topic-announcements.test.ts` | accepted/result types pass |
| Contacts | `bun --cwd apps/contacts vitest run 'src/app/[locale]/[wsId]/users/topic-announcements/topic-announcements-import.test.tsx' 'src/app/[locale]/[wsId]/users/topic-announcements/announcement-table.test.tsx'` | accepted/uncertain UI cases pass |
| Route wrappers | `bun web:api-routes:check` | moved routes stay first-class and no wrapper is regenerated |
| Migration manifest | `bun migration:tanstack:manifest` | manifest records new first-class source paths as `legacy-next` |
| Localization | `bun i18n:sort && bun i18n:key-parity && bun i18n:namespace-check` | EN/VI uncertain-state copy is sorted and paired |
| Typechecks | `bun run --cwd packages/internal-api type-check && bun run --cwd apps/contacts type-check && bun run --cwd apps/web type-check` | all exit 0 |
| Builds | `bun run --cwd apps/contacts build && bun run --cwd apps/web build` | all production builds exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Suggested executor toolkit

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$tuturuuu-agent-coordination`,
`$tuturuuu-commit`, `supabase`, and `vercel-react-best-practices`. Read root
route-migration rules before moving wrappers.

## Scope

**In scope:** first-class replacements for the two send routes and queue cron;
their focused tests; a first-class shared delivery helper/test; one additive
migration and `topic-announcement-delivery.sql`; generated Supabase types;
topic-announcement internal-api types/tests; the exact Contacts send, import,
and status-table callers/tests; EN/VI topic-announcement status keys; route
override/manifest; a thin compatibility re-export at the former legacy
`email.ts` path for untouched contact/verification routes; README status.

**Out of scope:** announcement import atomicity (Plan 168); contact verification
email delivery; provider replacement; templates/preview; raising the existing
50-recipient, five-attachment, or ten-megabyte limits; Rust delivery; automatic
retry of ambiguous provider outcomes; production apply.

## Git workflow

Use `fix/claim-topic-announcement-delivery`, run `bun setup`, and commit
`fix(contacts): claim announcement delivery`. Claim/release the commit window;
do not push unless instructed.

## Steps

### Step 1: Freeze the accepted and uncertain contracts

Define and test this closed public enqueue contract:

```ts
type TopicAnnouncementEnqueueResult =
  | {
      accepted: true;
      announcementId: string;
      attemptId: string;
      status: 'already_queued' | 'queued';
    }
  | {
      accepted: false;
      announcementId: string;
      errorCode:
        | 'active_attempt'
        | 'already_sent'
        | 'announcement_not_found'
        | 'delivery_uncertain'
        | 'email_not_verified'
        | 'no_recipients';
      status: 'rejected';
    };
```

For the single route, keep authentication failures at 401/403 and body/schema
failures at 400. Return `{ result }` with 202 for `accepted: true`, 404 for
`announcement_not_found`, and 409 for every other rejected code. For a valid
bulk request, always return `202 { results: TopicAnnouncementEnqueueResult[] }`
in input order; only request-wide auth/schema failures remain top-level 4xx.
Never return raw provider/database text. `resend: true` is the explicit user
action that may create a new attempt after `already_sent`, definitive failure,
or `delivery_uncertain`; false never does so.

Add failing route/helper/internal-api/UI tests for:

- the exact single and bulk status/envelope matrix above;
- two concurrent claims yielding one accepted attempt;
- provider success plus settlement failure never becoming resendable;
- a stale claim before dispatch returning to queued, but a stale attempt after
  dispatch becoming terminal `delivery_uncertain`;
- intentional `resend: true` creating a new attempt only after explicit user
  action, never from worker expiry;
- Contacts rendering localized uncertain state and a reconciliation
  warning without exposing provider/database text.

**Verify:** focused suites fail on the missing claim/uncertain behavior while
existing authorization cases remain green.

### Step 2: Add an atomic attempt lifecycle

Create an additive private delivery-attempt table or equivalent normalized
state with an immutable attempt UUID, announcement/workspace identity, status,
claim/dispatch/settlement timestamps, actor, stable public error code, and a
database uniqueness rule permitting at most one active attempt per announcement.
Add service-role-only RPCs to:

1. enqueue/claim one attempt under row lock;
2. mark dispatch started before the provider call;
3. settle sent or definitive failure only for the active attempt;
4. recover pre-dispatch stale claims to queued;
5. settle post-dispatch stale claims as `delivery_uncertain`, never queued.

Extend the announcement status constraint/type with `delivery_uncertain`. Add a
set-based, service-role-only verification query for up to 50 contact IDs so one
announcement does not run one RPC per recipient. Revoke all new private RPCs
from `PUBLIC`, `anon`, and `authenticated`.

**Verify:** focused pgTAP proves two-connection claim exclusion, attempt-id
settlement, pre/post-dispatch recovery, explicit resend, foreign-workspace
denial, role grants, and set-based verification.

### Step 3: Move and converge delivery workers

For each of the three first-class destinations, first inspect the tracked file
and prove it is only the generated legacy wrapper. Delete that wrapper, then
`git mv` the corresponding legacy `route.ts` into the now-empty destination.
Move the cron's colocated test the same way; create the two missing send-route
tests directly at their first-class destinations. If a destination contains
independent logic, STOP rather than overwrite it.

Move the substantive `email.ts` implementation and test to a first-class
`_shared` location, then replace the old legacy `email.ts` with a thin explicit
re-export so `server-helpers.ts` and both contact routes continue to compile.
The compatibility file must contain no delivery logic. Make both immediate
routes enqueue only and return the frozen response. Make the cron claim a
bounded batch through the same RPC, bound provider work with a small explicit
concurrency constant, mark dispatch before calling `sendWorkspaceEmail`, check
every transition result, and use the recovery contract above.

Do not claim exactly-once provider delivery: without a provider idempotency key,
post-dispatch ambiguity must remain visible and require reconciliation.

**Verify:** focused Web tests pass including concurrent request, provider
success/settlement failure, process interruption, and partial bulk acceptance.

### Step 4: Update typed callers and visible status

Change internal-api result types to the accepted contract. Update Contacts
mutations to treat `202` as accepted, refetch status, retain failed IDs for
review, and display `delivery_uncertain` with bilingual non-sensitive copy. Do
not claim that queued means sent, and do not edit or test the redirected
TanStack component fork.

**Verify:** internal-api, Contacts, and localization commands pass.

### Step 5: Complete route migration and full gates

Update source-embedded overrides for all three moved routes, keep their status
`legacy-next`/Rust target, regenerate the manifest, and run the wrapper check.
Then run typechecks, both builds, full isolated pgTAP, `bun check`, and
whitespace.

## Done criteria

- [ ] Accepted single requests and every valid bulk request use the exact bounded `202` contract.
- [ ] Single/bulk envelopes and every rejection code match the closed union; request-wide 4xx behavior is preserved.
- [ ] Only one active attempt can exist for an announcement.
- [ ] Dispatch is durably marked before provider I/O and ambiguous delivery is never auto-retried.
- [ ] Every state write is checked and conditional on the attempt identity.
- [ ] Recipient verification is set-based and worker concurrency is explicitly bounded.
- [ ] Contacts exposes queued versus uncertain truthfully in EN/VI.
- [ ] The legacy helper path is logic-free but keeps untouched contact/verification importers compiling.
- [ ] All moved routes stay first-class; wrapper/manifest, database, tests, builds, and repository gates pass.

## STOP conditions

Stop if Plans 154/163 are unavailable, provider idempotency semantics differ
from the inspected contract, the UI requires synchronous message/audit IDs, a
supported caller cannot accept `202`, exact route/message/database ownership is
not transferred, the migration cannot enforce one active attempt, or a
mandatory gate fails twice.

## Maintenance notes

`processing` is not proof of delivery. Only a conditional settlement for the
same attempt may mark `sent`; post-dispatch uncertainty is a terminal operator
state until the provider can be reconciled or a user explicitly chooses resend.
