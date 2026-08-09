# Plan 028: Bound Public AI Generate Input

> **Executor instructions:** Validate and cap the public generate endpoint's
> request bytes and text fields before credit checks, provider setup, or
> execution persistence. Reject oversized input; never truncate silently.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- packages/ai/src/generate apps/web/src/legacy-api-routes/ai/generate apps/docs/reference/api-reference/endpoint/generate.mdx`
> Stop on material request schema, route ownership, or provider-context drift.

## Status

- **Execution status:** TODO
- **Priority:** P1
- **Effort:** S
- **Risk:** MED
- **Category:** Performance / Security / AI cost
- **Depends on:** Plan 027
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

The API-key generate endpoint casts arbitrary JSON and sends unbounded prompt
and system strings to a metered model, then persists the full prompt, system
prompt, and output. Output tokens are capped, but input bytes and characters
are not, allowing avoidable memory, provider-cost, and database pressure before
the request fails downstream.

## Current state

- `packages/ai/src/generate/route.ts:78` uses an unchecked body assertion;
  request parsing is outside its main error boundary.
- The route forwards `prompt` and `configs.systemPrompt` to `streamText` and
  stores both in `workspace_ai_executions`; only output tokens are capped around
  line 228.
- `apps/web/src/legacy-api-routes/ai/generate/route.ts` remains the live Next
  source for documented `POST /api/ai/generate`; do not move it during this
  bounded-input fix without following the Web/Rust/TanStack migration rules.
- `apps/docs/reference/api-reference/endpoint/generate.mdx` is the public
  contract and must document any accepted-size limit and 413/422 response.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun --cwd packages/ai vitest run src/generate/route.test.ts` | boundary and early-rejection cases pass |
| AI typecheck | `bun --cwd packages/ai run type-check` | exit 0 |
| Repository gate | `bun check` | exit 0 |
| Web build | `bun --cwd apps/web run build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `packages/ai/src/generate/route.ts`, a colocated test, and narrow constants
- `apps/docs/reference/api-reference/endpoint/generate.mdx`
- The Web wrapper only if a test seam or response forwarding fix is necessary

Do not change models, pricing, output caps, API-key scopes, response success
shape, execution retention, or migrate the route to Rust/TanStack.

## Git workflow

- Branch: `fix/ai-generate-input-bounds` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(ai): bound generate request input`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Measure and choose explicit limits

Before editing, inspect provider model context windows and sampled production
request sizes if authorized telemetry is available. Define named constants for
maximum HTTP body bytes, prompt characters, and system-prompt characters with
headroom below the smallest supported model context. Record the rationale in
code comments and the public docs. Do not derive a token guarantee from
characters alone.

**Verify:** constants have tests at limit minus one, exact limit, and limit plus
one; STOP if real accepted traffic exceeds the proposed bounds or models have
incompatible context limits that require per-model tokenization.

### Step 2: Reject gross request size before JSON allocation

Inspect a valid numeric `Content-Length` before `req.json()`. Return 413 when it
exceeds the body limit. Missing, invalid, or chunked length remains unknown and
must continue to authoritative validation; never trust a small declared value.
Catch malformed JSON and return a stable 400 without reaching credit/database/
provider work.

**Verify:** declared-oversize and malformed-body tests make zero auth-key,
credit, model, execution-write, and deduction calls.

### Step 3: Validate the parsed body authoritatively

Use Zod or the repo's existing schema convention to require the current fields,
reject unknown/wrong types, and enforce prompt/system limits before model or
credit setup. Distinguish oversized fields with the documented 413 (or 422 if
the repo's established schema convention requires it) consistently. Do not
slice strings.

**Verify:** multibyte input tests prove the documented byte/character semantics;
valid current payloads reach the existing provider path unchanged.

### Step 4: Document and run gates

Update the generate reference with limits, rejection status, and a client
remediation note. Run focused tests, typecheck, `bun check`, and the Web build
because the live route contract changed.

## Done criteria

- [ ] Grossly oversized declared bodies are rejected before JSON parsing.
- [ ] Parsed prompt/system input is bounded before credits, provider setup, or
      persistence, including when `Content-Length` is absent or dishonest.
- [ ] Oversized input is rejected, never silently truncated.
- [ ] Public docs state exact limits and status semantics.
- [ ] Focused tests, typecheck, `bun check`, Web build, and whitespace pass.

## STOP conditions

Stop if production evidence requires larger limits than a supported model can
accept, if accurate enforcement requires model-specific tokenization, if the
live route has migrated from the legacy wrapper, or if an active AI policy lane
owns the same file. Write a separate versioned/per-model contract plan instead
of guessing.

## Maintenance notes

Output caps do not bound input cost or persistence size. Revisit these constants
whenever the allowed model set or provider context contracts change.
