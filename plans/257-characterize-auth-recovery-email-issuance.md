# Plan 257: Make Auth-Recovery Email Issuance Observable End to End

> **Executor instructions:** Give recovery-email issuance a closed service and
> HTTP result contract, then cover the complete boundary: disabled/expired
> overrides, credential persistence, provider failure, post-acceptance
> settlement, audit events, authorization, validation, and sanitized errors.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/infrastructure/src/lib/auth/recovery.ts apps/infrastructure/src/lib/auth/recovery.test.ts 'apps/infrastructure/src/app/api/v1/infrastructure/auth-recovery/[overrideId]/send-email/route.ts' 'apps/infrastructure/src/app/api/v1/infrastructure/auth-recovery/[overrideId]/send-email/route.test.ts' packages/internal-api/src/infrastructure/auth-recovery.ts packages/internal-api/src/infrastructure/auth-recovery.test.ts 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/auth-recovery/auth-recovery-client.tsx' 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/auth-recovery/auth-recovery-client.test.tsx' apps/infrastructure/messages/en.json apps/infrastructure/messages/vi.json tmp/agent-coordination`

## Status

- **Execution status:** TODO — no active exact-path owner; sequence with Plan
  256 because both change adjacent auth-recovery contracts
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / test coverage / provider settlement
- **Depends on:** none; rebase after Plan 256 if it lands first
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The recovery service creates a reusable credential, sends it through the email
provider, updates sent state, and appends success/failure audit events. It
currently ignores the sent-state update result and can report success after
settlement failed; thrown database/provider text is also copied into a 400.
Its only test imports the URL builder, and the authorization route has no
colocated test. A provider-accepted email must not become a retryable-looking
failure, but an unsettled credential must not be reported as fully settled.

## Current state and exact contract

- `apps/infrastructure/src/lib/auth/recovery.ts:86-102` resolves only an
  unrevoked, unexpired override and rejects email-disabled overrides.
- Lines 104-145 create one token/code row and render bounded recovery links;
  lines 152-185 send with `skipRecipientBlacklist:true` and log the existing
  `recovery_email_send_failed` event on provider failure.
- Lines 187-206 ignore the result of updating `sent_at`/`email_audit_id`, append
  `recovery_email_sent`, and return success. Introduce closed service results:
  `{status:'delivered',email,expiresAt,tokenId}` only after both settlement and
  success audit complete; `{status:'accepted_unsettled',email,expiresAt,tokenId}`
  when the provider accepted but either post-provider step failed. Never throw
  after provider acceptance and never resend automatically.
- Before acceptance, use `AuthRecoveryEmailError` with exact codes
  `override_unavailable`, `email_disabled`, `credential_persist_failed`, and
  `delivery_failed`. The route maps them respectively to
  `400 'Active recovery override not found'`,
  `400 'Recovery email is disabled for this override'`,
  `500 'Failed to create recovery credential'`, and
  `502 'Failed to send recovery email'`. Every unknown error is
  `500 'Failed to send recovery email'`; retain full detail only in safe
  server-side logs.
- `apps/infrastructure/src/lib/auth/recovery.test.ts` has three URL-only tests.
  Extend it with injected/mocked admin database, crypto, renderer, provider,
  and event-log seams while retaining those tests.
- The send-email POST route requires `manage_workspace_roles`, accepts only
  optional bounded `locale` and `next`, and passes the authorized actor and
  route override ID to the service. Map `delivered` to 200 and
  `accepted_unsettled` to 202 using the same `{result}` envelope. Before
  provider acceptance, map only closed service errors: missing/expired override
  or disabled recovery email -> sanitized 400; credential persistence ->
  sanitized 500; provider rejection -> sanitized 502; unclassified ->
  sanitized 500. No raw provider/database message reaches the response.
- Update `SendAuthRecoveryEmailResponse` to the discriminated result union.
  The client mutation treats both 200 and 202 as success; show the existing sent
  toast for `delivered` and a new localized warning toast for
  `accepted_unsettled`, then refresh diagnostics in both cases.
- Exact service matrix: missing/expired override; recovery-email disabled;
  override query error; token insert error; provider rejection; provider
  success with sent-state update; sent-state update error; success-event error;
  failure-event error; success/failure event arguments; returned expiry/ID.
  Assert provider is never called before a persisted credential, sent-state and
  success event never run after provider failure, and neither post-acceptance
  failure throws or permits an automatic resend.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-validation-offload`, and `$tuturuuu-commit`. Read root AGENTS and
the full recovery service, store, crypto, email renderer, route, internal-api
client, admin UI, messages, and existing tests. Sequence with Plan 256 rather
than editing adjacent recovery contracts concurrently; do not fold either
plan's scope into the other. Add the warning string to both English and
Vietnamese bundles and run `bun i18n:sort`.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Recovery service | `bun --cwd apps/infrastructure vitest run src/lib/auth/recovery.test.ts` | every pre-provider, delivered, accepted-unsettled, audit, and negative-call assertion passes |
| Send route/client | `bun --cwd apps/infrastructure vitest run 'src/app/api/v1/infrastructure/auth-recovery/[overrideId]/send-email/route.test.ts' 'src/app/[locale]/(dashboard)/[wsId]/auth-recovery/auth-recovery-client.test.tsx'` | 200/202/closed-error mappings and both UI outcomes pass |
| Internal API | `bun --cwd packages/internal-api vitest run src/infrastructure/auth-recovery.test.ts` | discriminated 200/202 response contract remains typed and URL-safe |
| Adjacent recovery | `bun --cwd apps/infrastructure vitest run src/lib/auth/recovery.test.ts src/app/api/v1/infrastructure/auth-recovery/route.test.ts 'src/app/api/v1/infrastructure/auth-recovery/[overrideId]/send-email/route.test.ts'` | collection and issuance contracts remain green together |
| Messages | `bun i18n:sort && bun i18n:check` | warning key is present and sorted in both bundles |
| Infrastructure | `bun run --cwd apps/infrastructure type-check && bun run --cwd apps/infrastructure build` | both exit 0 |
| Repository | `bun check && git diff --check` | all canonical gates pass; whitespace output is empty |

## Scope

**In scope:** the recovery service/test and minimal injectable seam; one new
colocated route test; internal-api response type/test; the existing admin client
and test; one warning key in Infrastructure English/Vietnamese bundles.

**Out of scope:** database schema/types, transactional override replacement
(Plan 256), credential consumption/session issuance, provider idempotency or
automatic resend, durable reconciliation jobs, email templates/content,
permissions, other UI, Web/Rust/TanStack source, or production email calls.

## Steps

1. Add the service matrix to the existing test using deterministic token/code,
   clock, admin-query, provider, and event mocks. Red-test the ignored update
   error and post-acceptance audit error. Assert exact negative calls at every
   phase; never snapshot raw credentials.
2. Add the route test following the existing Infrastructure auth-recovery route
   conventions. Cover authorization passthrough, invalid locale/next, empty
   body defaults, exact actor/override/request mapping, 200 delivered, 202
   accepted-unsettled, and every closed sanitized pre-provider error.
3. Introduce typed service errors/results. Inspect the settlement update;
   return accepted-unsettled on its error without logging a false sent event.
   Catch success-event failure as accepted-unsettled. If provider failure-event
   logging also fails, retain the sanitized provider-failure classification.
4. Update internal-api and the client to consume the union. Preserve the sent
   toast for delivered; add the bilingual warning toast for accepted-unsettled;
   refresh diagnostics after either response.
5. If module mocking cannot isolate the service, extract only a narrow
   dependency object while preserving the public function name/input contract
   and the new documented result union. Do not introduce a second
   implementation.
6. Run focused/adjacent/internal tests, i18n gates, Infrastructure typecheck/
   build, `bun check`, whitespace, and exact-scope gates. Confirm no live
   provider or database is contacted.

## Done criteria

- [ ] Every issuance phase, including sent-state and success-event failure
      after provider acceptance, has an exact result and negative-call test.
- [ ] The route exposes only closed sanitized 400/500/502 failures before
      provider acceptance, 200 delivered, or 202 accepted-unsettled.
- [ ] Internal API and UI distinguish delivered from accepted-unsettled without
      inviting an automatic resend; both refresh diagnostics.
- [ ] Existing URL, collection-route, provider option, and event-name contracts
      remain unchanged.
- [ ] Focused/adjacent tests, Infrastructure typecheck/build, repository,
      whitespace, and scope gates pass without live external calls.

## STOP conditions

Stop on active exact-path ownership, concurrent Plan 256 edits, a test requiring
live credentials/provider/database, a caller that cannot adopt the
discriminated result, need for schema/durable-job/permission changes, or any
mandatory gate failing twice.

## Maintenance notes

Provider acceptance is irreversible. Post-acceptance database/audit failure is
an accepted-but-unsettled success class, never a generic failure that invites
the administrator to send a second credential email.
