# Plan 314: Characterize the Public Speech-Execution Boundary

> **Executor instructions:** Add deterministic route and service coverage for
> public speech generation, including both provider transports, metering,
> audio shaping, aborts, and failure settlement. Use fake seams only.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/ai/src/app/v1/audio/speech/route.ts apps/ai/src/app/v1/audio/speech/route.test.ts apps/ai/src/lib/speech-execution.ts apps/ai/src/lib/speech-execution.test.ts apps/ai/src/lib/public-api.ts apps/ai/package.json tmp/agent-coordination`

## Status

- **Execution status:** TODO — coordinate with the adjacent CS35 public-API/metering owner before editing
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** tests
- **Depends on:** adjacent AI Studio metering review; no exact-path owner
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

Public speech execution reserves credits, dispatches through two distinct
provider protocols, decodes audio, settles usage, and maps abort/failure states.
The current two happy-path tests leave nearly every billing, timeout, malformed
response, and HTTP contract able to regress without a focused signal.

## Current state and exact contract

- `speech-execution.ts:97-267` validates model/config, prepares one metered
  execution, owns Google and gateway requests, enforces a 30-second internal
  timeout, finds/decode base64 audio, settles, and returns WAV/PCM headers.
- `speech-execution.test.ts:35-124` covers only successful Google WAV and
  gateway OIDC calls. It does not cover schema/model/config/provider errors,
  PCM, malformed audio, settlement rejection, request abort, or timeout.
- `audio/speech/route.ts:8-23` converts invalid JSON/schema to the public 400
  envelope before execution, but has no route test.
- Preserve current behavior rather than redesigning shared metering: validation
  performs no preparation/provider call; preparation failure performs no
  settlement; failures after preparation attempt one contained failed/aborted
  settlement; a failure of that fallback never replaces the original public
  error. Success-settlement rejection currently enters that same fallback path;
  characterize the exact call sequence and report any conflict with Plan 167
  instead of silently changing the shared invariant here.
- Google uses the configured model and API-key interaction body; gateway uses
  the mapped voice, configured model header, and bearer/OIDC credential.
  Tests must assert no real credential value is logged or returned.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Coordinate with the active CS35 lane because it owns the
imported `public-api.ts`; this plan must not edit shared metering semantics.
Use fake fetch/timers and inert environment values only.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun --cwd apps/ai vitest run src/lib/speech-execution.test.ts src/app/v1/audio/speech/route.test.ts` | complete route/provider/metering matrix passes without network |
| AI typecheck | `bun run --cwd apps/ai type-check` | exit 0 |
| AI build | `bun run --cwd apps/ai build` | exit 0 |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |

## Scope

**In scope:** extend speech execution tests; create the route test; only the
smallest route/execution seam needed for deterministic injection if tests prove
it necessary; `plans/README.md` status only.

**Out of scope:** shared `public-api.ts`; pricing or idempotency semantics;
provider/model changes; new dependencies; live credentials/network; other text,
image, or embedding endpoints.

## Steps

1. Add route tests for malformed JSON, null/non-object bodies, each schema
   rejection, defaults, and exact delegation; every rejection is canonical 400
   and performs no execution/provider work.
2. Extend service tests for invalid/unavailable model, missing configuration,
   preparation failure, exact Google/gateway requests, WAV/PCM bytes and
   headers, non-2xx, invalid JSON, missing audio, request abort, internal
   timeout, and both response formats.
3. Assert metering boundaries: one preparation, exact max-usage/metadata/scope,
   success usage, failed versus aborted settlement, success-settlement failure
   fallback, and contained fallback-settlement failure.
4. Restore environment/globals/fake timers after every case and run all gates.

## Done criteria

- [ ] The live route's invalid-body contract is tested and never reaches execution.
- [ ] Both provider protocols and WAV/PCM response contracts are exact.
- [ ] Every pre/post-reservation failure and abort/timeout settlement path is covered.
- [ ] No test uses a live provider, credential, or wall-clock timeout.
- [ ] Shared metering semantics remain untouched and all mandatory gates pass.

## STOP conditions

Stop on adjacent owner overlap; a test proving current shared settlement can
double-charge or lose usage; a required `public-api.ts` semantic change; a need
for live provider access; an app build unavailable at the planned snapshot; or
a gate failing twice.

## Maintenance notes

Keep this matrix aligned with Plans 167, 293, and 299. If the shared terminal
settlement policy changes, update all public modality fixtures together.
