# Plan 027: Sanitize AI Route Error Envelopes

> **Executor instructions:** Keep detailed failures in server logs and return a
> stable, non-sensitive envelope for unexpected errors. Preserve intentional
> validation, authorization, rate-limit, and credit status codes.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- packages/ai/src/generate packages/ai/src/executions packages/ai/src/chat/google packages/ai/src/object`
> Stop on material error-contract or route ownership drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** Plan 025 remains build-blocked with its reviewed Teach object
  route implementation uncommitted; this plan's overlapping error-envelope
  work cannot start until that dependency is DONE
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** Security / API correctness
- **Depends on:** Plan 025
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

Several public or authenticated AI handlers interpolate `Error.stack` directly
into JSON/Markdown responses. Stack traces can disclose source paths, internal
module names, provider details, and operational context; the summary route also
reports an unexpected failure with HTTP 200, making failures look successful.

## Current state

Stack-bearing responses exist at:

- `packages/ai/src/generate/route.ts:397`
- `packages/ai/src/executions/route.ts:86`
- `packages/ai/src/chat/google/summary/route.ts:125`
- `packages/ai/src/chat/google/new/route.ts:318`
- `packages/ai/src/chat/google/route.ts:689`

The three object-generation routes have the same problem today but Plan 025
moves and hardens them first. `packages/ai/src/studio/errors.ts` demonstrates
the desired separation between server diagnostics and client-safe provider
messages, but is OpenAI-specific and should not become the generic route API.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun --cwd packages/ai vitest run src/generate src/executions src/chat/google src/route-error.test.ts` | representative thrown errors are sanitized |
| AI typecheck | `bun run --cwd packages/ai type-check` | exit 0 |
| Leak scan | `rg -n "error\\.stack|Stack trace|No stack trace available" packages/ai/src --glob 'route.ts'` | no output |
| Repository gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- A small generic helper such as `packages/ai/src/route-error.ts` and test
- The five handlers listed above and focused route tests
- Object routes only if Plan 025 left an equivalent handler after approved
  drift reconciliation

Do not change successful payloads, expose provider/DB messages, redesign logging,
or change known validation/auth/credit/rate-limit responses.

## Git workflow

- Branch: `fix/ai-safe-error-envelopes` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(ai): sanitize route error responses`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Define one unexpected-error contract

Create a server-only helper that logs the original unknown error with native
`console.error` and returns a stable JSON body such as
`{ error: 'Internal server error', code: 'INTERNAL_ERROR' }` with status 500.
It must never serialize stack, cause, raw provider payload, database message,
request headers, prompt, or credentials. Allow a safe operation label only in
the log, not arbitrary caller data in the response.

**Verify:** helper tests use errors containing fake paths/tokens and prove none
of those strings occur in serialized responses while the original error is
logged once.

### Step 2: Replace unexpected catch responses

Use the helper in all scoped catches. Change the summary catch from 200 to 500.
Leave deliberately classified errors and their existing statuses intact. For
raw database errors currently returned as 500, replace the client body with a
safe operation-level message and log the raw error server-side.

**Verify:** route tests cover plain `Error`, non-Error throws, provider errors,
and database failures; every response is stable and non-sensitive.

### Step 3: Run the leak scan and gates

Run the exact `rg` command and all package/repository checks. Inspect the diff
to ensure prompts, models, authorization, metering, and success bodies did not
change.

## Done criteria

- [ ] No AI `route.ts` response includes a stack trace or raw unexpected error.
- [ ] Unexpected failures consistently return 500 and a stable safe envelope.
- [ ] Detailed errors remain available through severity-preserving server logs.
- [ ] Known client-actionable errors retain their existing status and shape.
- [ ] Focused tests, typecheck, leak scan, `bun check`, and whitespace pass.

## STOP conditions

Stop if a documented client parses the current stack-shaped message, if Plan
025 has not resolved the object-route overlap, or if sanitization requires a
breaking change to a known error union. Document and stage that migration
separately rather than preserving leakage.

## Maintenance notes

Future AI handlers should use the same helper only for unexpected failures;
typed expected errors remain explicit. Never install a console drain or custom
runtime logger.
