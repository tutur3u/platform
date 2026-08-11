# Plan 303: Authenticate Public Agent Invocations Once

> **Executor instructions:** Use the public AI credential boundary once, pass
> that exact credential into metering, and distinguish database failure from an
> absent agent. Characterize the complete route without live providers.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/ai/src/app/v1/agents/[agentId]/responses/route.ts' 'apps/ai/src/app/v1/agents/[agentId]/responses/route.test.ts' apps/ai/src/lib/public-credential.ts apps/ai/src/lib/public-api.ts apps/ai/src/lib/text-execution.ts apps/docs/reference/api-reference/ai-studio.mdx tmp/agent-coordination`

## Status

- **Execution status:** TODO — exact route/test are unclaimed; coordinate the adjacent CS35 AI Studio owner
- **Priority:** P0
- **Effort:** M
- **Risk:** LOW-MEDIUM
- **Category:** correctness / authentication / test coverage
- **Depends on:** adjacent AI Studio public-auth and metering review
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

The documented public agent endpoint authenticates first with an API-key-only
helper, so registered `ttr_app_` callers fail before reaching the public
credential boundary. Successful API-key calls then omit the resolved credential
when invoking text execution, causing a second lookup/hash validation. Agent and
version database errors are also discarded and reported as misleading 404s.

## Current state and exact contract

- `agents/[agentId]/responses/route.ts:21-25` calls
  `authenticateAiStudioRequest`; `packages/ai/src/studio/auth.ts:17-72` accepts
  only Studio API keys.
- Docs `ai-studio.mdx:28-43,45-55` allow registered external-app tokens for the
  endpoint. Use existing `authenticatePublicAiRequest(request)` with its default
  `ai:use` scope so API keys and registered external apps share the established
  policy, workspace header, membership, attribution, and rate boundary.
- Pass the returned `PublicAiCredential` as `credential` to
  `executeTextRequest`. `text-execution.ts:50-67` already supports this; assert
  the route calls the public authenticator exactly once, passes that exact
  credential to execution, and neither imports nor directly calls the
  Studio-only helper. The public authenticator may internally call the Studio
  helper once for an API-key credential; do not assert otherwise.
- Check both Supabase errors. Query failure returns canonical sanitized 500;
  genuine absent/archived/foreign agent remains the existing 404. Version query
  failure returns sanitized 500; missing latest version remains its existing
  404. Never expose SQL/provider messages.
- Preserve `agentInputSchema`, latest-version selection, exact model and
  instructions injection, feature `agent:<id>`, response shape, streaming,
  request/idempotency headers, metering, and external-app attribution.
- Keep shared public-auth/metering files read-only unless their active owner
  explicitly transfers them and a focused test proves a required defect there.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Coordinate with the CS35 owner of shared AI auth/metering.
Use fake credentials, database, and text-execution seams; no network, real key,
provider, or credit mutation.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused | `bun --cwd apps/ai vitest run 'src/app/v1/agents/[agentId]/responses/route.test.ts' src/lib/public-credential.test.ts src/lib/public-api.test.ts` | both credential kinds, single auth, DB mapping, and dispatch pass |
| AI suite | `bun run --cwd apps/ai test && bun run --cwd apps/ai type-check` | all AI tests/types pass |
| AI build | `bun run --cwd apps/ai build` | production build passes |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only the agent route/test and plan status changed unless transfer expanded scope |

## Scope

**In scope:** public agent response route and new colocated route test.

**Read-only evidence:** public credential/auth, text execution, public API
metering tests, and the current docs contract.

**Out of scope:** shared credential semantics; key issuance; model policy;
pricing; settlement changes; agent CRUD/versioning; docs changes; other public
AI endpoints.

## Steps

1. Add red cases for malformed body, API key, external-app token, missing
   workspace header/scope/membership, foreign/archived/missing agent, independent
   agent/version query failures, missing version, and provider/execution failure.
2. Assert success passes the exact resolved credential, model, instructions,
   feature, and response shape once; use deferred promises to cover streaming
   without live provider work.
3. Replace the Studio-only auth call with the existing public authenticator,
   pass its credential into execution, and inspect query errors before absence.
4. Run focused, AI suite/type/build, repository, whitespace, and scope gates.

## Done criteria

- [ ] Documented API keys and registered external-app tokens reach the same public agent boundary.
- [ ] Every request authenticates once and meters with that exact credential.
- [ ] Database failures are sanitized 500s; genuine absence remains 404.
- [ ] Latest model/instructions, streaming, idempotency, and attribution are unchanged.
- [ ] No live credential/provider/database call occurs in tests.
- [ ] All mandatory gates pass.

## STOP conditions

Stop on active exact-path overlap; evidence the docs intentionally overstate
external-app support; a required shared-helper edit without transfer; changed
metering or attribution semantics; live secret/network requirements; or any
mandatory gate failing twice.

## Maintenance notes

Resolve a request credential once and thread it through every downstream policy
and metering decision. Reauthentication creates both waste and state races.
