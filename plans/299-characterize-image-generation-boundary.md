# Plan 299: Characterize the Public Image-Generation Boundary

> **Executor instructions:** Put JSON/schema failures inside the canonical
> public API error boundary and make reservation, provider, settlement, capture,
> abort, and partial-failure behavior executable in focused tests.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/ai/src/app/v1/images/generations apps/ai/src/lib/image-execution.ts apps/ai/src/lib/image-execution.test.ts apps/ai/src/lib/public-api.ts apps/ai/src/lib/speech-execution.test.ts tmp/agent-coordination`

## Status

- **Execution status:** TODO — exact paths are unclaimed; coordinate the adjacent AI Studio metering lane
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** test coverage / API correctness
- **Depends on:** adjacent AI Studio metering review
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The route parses JSON and throws Zod errors before entering
`executeImageRequest`, so malformed public requests bypass its canonical 400
mapper. The metered 1..4-provider-call boundary has no focused test, allowing
reservation, settlement, capture, abort, or partial-provider failures to drift
while the AI suite remains green.

## Current state and exact contract

- `apps/ai/src/app/v1/images/generations/route.ts:4-9` calls
  `request.json()` and `imageRequestSchema.parse` before execution.
- `image-execution.ts:26-60` reserves once, launches exactly `n` image calls,
  then settles success and captures content. Lines 76-92 settle failed/aborted
  context and map Zod errors, but cannot see route parse failures.
- Preserve schema and output: nonempty model; prompt length 1..100,000; `n`
  1..4 default 1; current sizes/aspect ratios; b64 output; created seconds;
  request ID and no-store headers.
- Move unknown-body JSON/schema handling inside a guarded route/service
  boundary so malformed JSON and Zod failures return the existing OpenAI-style
  `invalid_request_error`, status 400, with zero prepare/provider/settlement/
  capture calls.
- Add exported `executeImageHttpRequest(request)` in `image-execution.ts` as the
  route's only entrypoint. Its outer `try/catch` performs `request.json()` and
  `imageRequestSchema.parse`, converts both JSON syntax/type failures and Zod
  failures into `AiStudioError(code: 'invalid_request_error', status: 400)`,
  and calls `publicApiError` without a request ID before any context exists.
  On valid input it delegates to the existing validated
  `executeImageRequest(request, input)` core, whose provider/settlement behavior
  stays unchanged. The route becomes only `connection()` plus this call.
- Freeze provider semantics rather than inventing retry: one reservation,
  exactly `n` concurrent calls, all-or-error `Promise.all`. If any provider call
  rejects after others succeed, settle the single execution `failed` (or
  `aborted` when the request signal is aborted), usage `{}`, capture no success
  content, and return the canonical provider error. Settlement failure in the
  success branch remains an error response followed by one contained
  failed/aborted settlement attempt. Preserve the same current behavior when
  capture rejects: even if success settlement completed, return an error and
  attempt the failed/aborted settlement once. If that second settlement rejects,
  swallow only that rejection and preserve the original public error envelope.
  This plan characterizes that sequence; changing optional-capture or
  double-settlement semantics requires a separate reviewed corrective plan.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Coordinate with the in-progress CS35 AI Studio owner, but
do not edit its owned `public-api.ts` unless exact transfer is granted. Use the
existing speech execution test as the mocking pattern; no live provider calls.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused | `bun --cwd apps/ai vitest run src/lib/image-execution.test.ts src/app/v1/images/generations/route.test.ts` | validation, n=1/4, metering, partial failure, abort, and capture/settlement cases pass |
| AI suite | `bun run --cwd apps/ai test && bun run --cwd apps/ai type-check` | all AI tests/types pass |
| AI build | `bun run --cwd apps/ai build` | production build passes |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** image-generation route plus new route test; image execution plus
new focused test; `public-api.ts` only with exact owner transfer and only if its
existing error mapper cannot represent the frozen 400 contract.

**Out of scope:** prompt/body limits beyond the existing schema; credentials;
pricing; model allowlists; execution identity; retry; partial image success;
provider selection; other AI endpoints; database schema/types.

## Steps

1. Add red route tests for malformed JSON, primitives, missing/invalid fields,
   and each schema boundary. Assert stable sanitized 400 and zero downstream calls.
2. Add service tests for `n=1` and `n=4`, exact gateway model/aspect/prompt/abort
   arguments, one reservation, success usage, capture metadata/content, response
   shape/headers, and no secret/raw provider data.
3. Add deferred-promise tests proving concurrency, one of four rejecting after
   peers resolve, request abort, prepare failure, success-settlement failure,
   failure-settlement failure containment, and capture failure. Prove success
   settlement or capture rejection returns an error then attempts exactly one
   contained failed/aborted settlement; failure-settlement rejection preserves
   the original error. Keep provider all-or-error behavior; do not add retries.
4. Move parsing into the guarded boundary with the smallest change, then run
   focused, AI suite/typecheck/build, repository, whitespace, and scope gates.

## Done criteria

- [ ] Malformed/schema requests return canonical 400 with zero metering/provider work.
- [ ] One reservation launches exactly 1..4 concurrent provider calls with exact arguments.
- [ ] Success, partial failure, abort, settlement, and capture semantics are explicit and tested.
- [ ] No live provider/network call occurs in tests.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on active exact-path overlap; a required `public-api.ts` change without
transfer; evidence that partial image success is a supported contract; provider
mocking that requires live credentials/network; an incompatible canonical error
envelope; or a mandatory gate failing twice.

## Maintenance notes

Keep validation inside the same boundary that owns public error mapping.
Changes to `n`, image result aggregation, or settlement must update this matrix.
