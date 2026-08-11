# Plan 293: Bound Embedding Requests Before Metering and Provider Dispatch

> **Executor instructions:** Preserve the OpenAI-compatible success contract,
> but reject oversized or malformed embedding requests through the canonical
> error envelope before token estimation, credit reservation, content capture,
> or provider dispatch.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/ai/src/app/v1/embeddings apps/ai/src/lib/embedding-execution.ts apps/ai/src/lib/embedding-execution.test.ts apps/ai/src/lib/bounded-json-body.ts apps/ai/src/lib/bounded-json-body.test.ts apps/ai/src/lib/public-api.ts apps/docs/reference/api-reference/ai-studio.mdx tmp/agent-coordination`

## Status

- **Execution status:** TODO — exact paths are unclaimed; coordinate the
  adjacent in-progress AI Studio public-metering lane before editing
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / availability / API correctness / test coverage
- **Depends on:** adjacent AI Studio metering review
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The schema independently permits 2,048 strings of up to 1,000,000 characters,
so its accepted shape can contain roughly two billion characters. The route
fully parses JSON and throws schema failures before entering the execution
error boundary. A single request can therefore impose extreme allocation and
token-count work before metering, while malformed requests bypass the public
API's canonical error mapper.

## Current state and exact contract

- `embeddingRequestSchema` permits one nonempty string or 1..2,048 nonempty
  strings; each string has a 1,000,000-character maximum. Preserve the model,
  dimensions `1..16,384`, item-count, and individual-string contracts, but add
  one aggregate maximum of **1,000,000 JavaScript characters** across all
  inputs. Exact-limit input is valid; limit-plus-one returns 413. Do not slice.
- Add `apps/ai/src/lib/bounded-json-body.ts` with a reusable request-body reader
  capped at exactly **4,250,000 bytes**. Reject a valid larger `Content-Length`
  before reading. For missing, invalid, chunked, or dishonest lengths, consume
  `request.body` incrementally, count actual bytes, cancel the reader as soon as
  the cap is exceeded, and never concatenate an over-limit body. Exact-limit
  bytes are accepted; limit-plus-one returns 413.
- Decode the bounded bytes as UTF-8 once, parse JSON once, and validate the
  schema inside the route's guarded boundary. Use fatal UTF-8 decoding and a
  `.strict()` top-level Zod object. Invalid UTF-8, malformed JSON,
  wrong types, unknown top-level keys, and ordinary schema failures return the
  canonical OpenAI `invalid_request_error`, status 400. Body/aggregate size
  failures use the same sanitized envelope with status 413. No raw Zod/JSON
  error or stack reaches callers.
- `executeEmbeddingRequest` receives only a fully validated payload. Rejected
  requests must make zero calls to `approximateTokenCount`,
  `prepareMeteredExecution`, `resolveEmbeddingModel`, `embedMany`,
  `captureAiStudioContent`, or `settleMeteredExecution`.
- Preserve model routing, estimated/resolved usage, reservation and settlement,
  content capture, response fields/order, `cache-control`, request ID, abort
  behavior, and provider-failure mapping. Add success plus provider-failure
  settlement characterization rather than changing those semantics.
- Document item, aggregate-character, and byte ceilings plus 400/413 behavior in
  `apps/docs/reference/api-reference/ai-studio.mdx` without publishing internal
  credential or provider details.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Ask the in-progress AI
Studio machine-credential owner to confirm no overlap with
`embedding-execution.ts`; do not touch its owned `public-api.ts` seam unless an
existing exported error constructor cannot express 413. If that shared file is
required, obtain exact transfer before editing.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused boundary | `bun --cwd apps/ai vitest run src/lib/bounded-json-body.test.ts src/lib/embedding-execution.test.ts src/app/v1/embeddings/route.test.ts` | byte, aggregate, malformed, early-rejection, success, and settlement cases pass |
| AI app | `bun run --cwd apps/ai type-check && bun run --cwd apps/ai build` | AI app compiles and builds |
| Docs JSON | `node -e "JSON.parse(require('fs').readFileSync('apps/docs/docs.json','utf8'))"` | docs navigation configuration remains valid |
| Repository | `bun check && git diff --check` | repository and whitespace gates pass |
| Scope | `git status --short` | only embedding boundary/tests and the AI Studio API reference changed |

## Scope

**In scope:** the embeddings route; embedding execution module/test; the exact
new bounded-reader module/test; one new route test; the existing AI Studio API
reference; `public-api.ts` only if exact owner transfer is obtained and only for
a reusable 413 error mapping that preserves every caller.

**Out of scope:** model allowlists; pricing; credential/auth semantics;
execution identity; database schema/types; provider selection; embedding output
dimensions/data; other `/v1` endpoints; streaming output; package dependencies.

## Steps

1. Add red bounded-reader tests for declared oversize, honest exact size,
   missing/chunked length, dishonest small length, multibyte UTF-8, invalid
   UTF-8, malformed JSON, and cancellation at the first over-limit chunk.
2. Add red route/execution tests at aggregate character limit minus one, exact
   limit, and plus one; 2,048 tiny inputs; per-item overflow; invalid fields;
   and every early-rejection spy. Characterize successful provider settlement
   and rejected-provider settlement without changing their contract.
3. Implement the incremental byte reader and strict request schema. Move JSON
   parsing/schema validation inside the canonical API error boundary and add
   the aggregate refinement before token estimation.
4. Update the AI Studio API reference with the exact limits and response
   statuses. Run focused, app typecheck/build, docs, repository, whitespace,
   and scope gates.

## Done criteria

- [ ] Actual body bytes are capped at 4,250,000 even without an honest Content-Length.
- [ ] Aggregate input is capped at 1,000,000 characters while existing per-item/count/dimension semantics remain exact.
- [ ] Malformed/schema input returns sanitized OpenAI-compatible 400; size violations return the same envelope with 413.
- [ ] Every rejected request performs zero estimation, metering, provider, capture, or settlement work.
- [ ] Valid success and provider-failure settlement behavior remains characterized and unchanged.
- [ ] Focused, AI typecheck/build, docs, repository, whitespace, and scope gates pass.

## STOP conditions

Stop on a documented/observed supported client that requires more than the
frozen aggregate/body limits; inability to cancel an over-limit stream before
concatenation; active overlap in the embedding paths; a required shared
`public-api.ts` edit without transfer; an incompatible canonical error envelope;
provider/metering semantic drift; or any mandatory gate failing twice.

## Maintenance notes

`Content-Length` is only an early hint, never the authoritative bound. Preserve
both the streamed byte ceiling and the post-parse aggregate ceiling so chunked,
compressed, multibyte, and dishonest requests cannot bypass the boundary.
