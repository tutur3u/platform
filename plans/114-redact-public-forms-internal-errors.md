# Plan 114: Redact Internal Failures from Public Forms Responses

> **Executor instructions:** Preserve deliberate public 4xx errors while
> replacing unclassified 500 response details with one stable generic envelope.
> Keep full internal failure context only in structured server logs.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- 'apps/forms/src/app/api/v1/shared/forms/[shareCode]' apps/forms/src/features/forms tmp/agent-coordination`
> Stop on shared-form error handling or Forms ownership drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** security
- **Depends on:** Forms satellite owner releasing or transferring these routes
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

Anonymous submission and response-copy handlers return caught database/provider
messages verbatim. Constraint, schema, or operator details can therefore escape
through a routine public 500 response.

## Current state

- `shared/forms/[shareCode]/route.ts:303-348` throws Supabase insert messages
  unchanged; lines 421-429 return the caught message in a 500 body.
- `response-copy/route.ts:172-184` repeats the same catch-to-response pattern.
- Intentional authentication, duplicate, Turnstile, response-limit, and rate-
  limit errors already have public 4xx contracts and must remain specific.
- The submission route intentionally catches response-copy delivery faults and
  returns 201 with `responseCopyStatus: 'failed'` or `'rate_limited'`; this
  partial-success contract must not become a submission failure.
- `tmp/agent-coordination/20260721-224500-claude-forms-satellite-migration.md`
  has no canonical status and claims `apps/forms/**`, so it remains active.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Do not start until
the Forms owner explicitly transfers these exact paths or terminates and
archives the note.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Shared submission tests | `bun --cwd apps/forms vitest run 'src/app/api/v1/shared/forms/[shareCode]/route.test.ts'` | public error-envelope cases pass |
| Response-copy tests | `bun --cwd apps/forms vitest run 'src/app/api/v1/shared/forms/[shareCode]/response-copy/route.test.ts'` | expected 4xx and generic 500 cases pass |
| Forms typecheck | `bun run --cwd apps/forms type-check` | exit 0 |
| Forms build | `bun run --cwd apps/forms build` | exit 0 |
| Repository gate | `bun check` | exit 0 or documented unrelated blocker |
| Whitespace | `git diff --check` | no output |

## Scope

- the two public shared-form route handlers and colocated new tests
- one small Forms-local error classifier only if both handlers share it
- `plans/README.md` only for status

Do not redesign atomic submission, quotas, response-copy delivery, user-facing
4xx wording, or database schemas.

## Git workflow

Use branch `fix/forms-public-error-envelope` in an isolated worktree and run
`bun setup`. Commit `fix(forms): redact public internal errors`. Claim the
commit window before staging; do not push unless instructed.

## Steps

### Step 1: Lock the public contract

Following `apps/forms/.../forms/[formId]/route.test.ts` for route mocks, create
tests for intentional 400/401/404/409/429 outcomes and injected response insert,
answer insert, lookup, and mail-provider failures. Use inert synthetic internal
messages and assert none appears in response bodies.

### Step 2: Classify expected public failures

Implement this exact per-route matrix; do not invent additional public classes:

| Handler | Condition | Required response |
| --- | --- | --- |
| shared GET/POST | unauthenticated form access | existing safe 401 message |
| shared POST | schema/answer validation or Turnstile rejection | existing safe 400 envelope |
| shared POST | missing/closed/session/duplicate/response-limit branches | existing 404/410/409 envelope |
| shared POST | response-copy quota or delivery failure after persistence | preserve 201 and `responseCopyStatus: 'rate_limited'` / `'failed'`; never roll back or return 500 |
| response-copy POST | schema, auth, missing/closed/duplicate branches | existing 400/401/404/410/409 envelope |
| response-copy POST | Turnstile rejection | existing safe 400 envelope |
| response-copy POST | response-copy quota | stable safe 429 envelope through a typed/code-bearing error, not arbitrary message matching |
| response-copy POST | mailer returns no recipient | preserve the current safe support-oriented 500 message |
| either route | every other thrown database/provider/programming error | exactly `{ error: 'Internal server error' }`, status 500 |

Use existing Turnstile classification and introduce a Forms-local typed/code-
bearing error for authentication/quota only where the helper currently throws
plain text. Everything else must log route/form/session correlation without
sensitive answer content and use the generic 500 envelope.

### Step 3: Apply the same boundary to response copies

Keep Turnstile and rate-limit responses specific, but sanitize unclassified
mailer/database faults. Explicitly test that the main submission path still
returns 201 after copy failure and that only the dedicated retry endpoint may
return its classified 429/500 outcomes. Do not return stack traces, query
details, or raw provider messages.

### Step 4: Run application gates

Run both focused suites, Forms typecheck/build, `bun check`, and whitespace.

## Done criteria

- [ ] Unclassified public 500 responses use one stable generic envelope.
- [ ] Intentional 4xx status/message contracts remain covered and unchanged.
- [ ] Post-submission copy failure still returns 201 with the current status field.
- [ ] Internal details are logged server-side without response-answer content.
- [ ] Focused tests, typecheck, Forms build, and repository gates pass.

## STOP conditions

Stop if Forms ownership is not transferred, a documented external client relies
on raw 500 text, sanitization requires changing an out-of-scope delivery helper,
or an in-scope gate fails twice.

## Maintenance notes

Public error bodies are API contracts; classify expected failures explicitly
and never derive a 500 response directly from a caught provider message.
