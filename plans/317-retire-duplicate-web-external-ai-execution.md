# Plan 317: Retire Duplicate Web External-AI Execution

> **Executor instructions:** Establish the canonical AI host as the only
> execution authority for external-app chat completions and speech. Inventory
> consumers and preserve the supported compatibility surface before deleting
> Web's duplicate auth, provider, metering, settlement, and retry stack. Do not
> guess that external traffic is absent.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/web/src/app/api/v1/external-ai apps/web/src/lib/external-ai apps/ai/src/lib apps/ai/src/app/v1 apps/ai/src/components/developer-docs apps/docs/reference/api-reference/ai-studio.mdx apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — external-consumer disposition plus AI/G22 transfer required
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM-HIGH
- **Category:** architecture / migration
- **Depends on:** Plans 167, 293, 299, 303, and 314; CS35 AI and G22 manifest transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-12

## Why this matters

Web and AI currently implement separate public execution stacks for the same
chat-completion and speech products. Authentication, model policy, billing,
retry, settlement, and error behavior can drift, and the migration manifest
incorrectly treats the duplicate Web handlers as future Rust work rather than
retirement debt.

## Current state and exact contract

- `apps/web/src/app/api/v1/external-ai/chat/completions/route.ts` and
  `audio/speech/route.ts` expose Web POST handlers. Their only implementation
  callers are `apps/web/src/lib/external-ai/chat-completions.ts` and `speech.ts`.
- `apps/web/src/lib/external-ai/auth.ts:58-169` implements external-app-only
  workspace/scoped authentication. The two executors independently own request
  schemas, Google dispatch, metering/settlement, retries, streaming/audio
  shaping, and OpenAI errors; their source plus tests total 1,302 lines.
- `apps/ai/src/lib/public-credential.ts:223-259` is the canonical broader
  credential boundary for external-app tokens and Studio keys. The maintained
  docs list `/v1/chat/completions` and `/v1/audio/speech` on the AI host at
  `apps/docs/reference/api-reference/ai-studio.mdx:45-59`.
- Repository caller search finds no production caller of `/api/v1/external-ai/*`
  outside Web's own tests and migration manifest. This is not proof that an
  external deployed client is absent. The authoritative supported-use signal
  is `private.ai_studio_runs`: both legacy executors stamp
  `metadata.provider_route = 'tuturuuu-web-google'`, while the reservation RPC
  adds `metadata.external_app_id` and the feature (`chat_completions` or
  `text_to_speech`).
- Before deletion, an authorized operator must run a read-only 30-day aggregate
  grouped by `metadata ->> 'external_app_id'` and `feature`, filtered to that
  exact provider route, returning only count and `max(created_at)`. Record the
  redacted result and approval in the executor's untracked coordination note
  `tmp/agent-coordination/<timestamp>-plan-317-external-ai-retirement.md`; never
  copy bearer tokens, request bodies, prompts, or raw run rows. A supported
  caller is any group with count greater than zero. If one exists, STOP: its
  owner must migrate it to `https://ai.tuturuuu.com/v1/*` outside this plan,
  then a new continuous 30-day zero-use window must complete.
  The exact read-only query is:

  ```sql
  select
    metadata ->> 'external_app_id' as external_app_id,
    feature,
    count(*)::bigint as run_count,
    max(created_at) as last_seen_at
  from private.ai_studio_runs
  where created_at >= now() - interval '30 days'
    and metadata ->> 'provider_route' = 'tuturuuu-web-google'
  group by 1, 2
  order by 1, 2;
  ```
- After the approved window is zero, delete both Web handlers and the complete
  `apps/web/src/lib/external-ai/**` implementation/tests. Remove any matching
  route override, regenerate the TanStack manifest, and assert neither route is
  tracked as `legacy-next`/`rust-backend`. Keep canonical AI routes and docs.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-ci-docs`,
`$tuturuuu-agent-coordination`, and `$tuturuuu-commit`. Complete or reconcile
the listed AI boundary plans, obtain CS35/G22 exact-path transfer, and get the
operator-approved zero-use evidence in the exact coordination note. Repository
search alone cannot clear the deletion gate, and this plan does not modify an
external caller repository.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Repository callers | `rg -n '/api/v1/external-ai/(chat/completions|audio/speech)|apps/web/src/lib/external-ai' --glob '!plans/**' --glob '!tmp/agent-coordination/**' .` | before deletion only the known Web stack/tests/manifest match; afterward no match remains |
| Canonical AI tests | `bun --cwd apps/ai vitest run` | canonical chat/speech/auth/metering suites pass with fake providers only |
| Route tracking | `bun migration:tanstack:manifest && bun migration:tanstack:check` | generated manifest is current and contains neither retired Web route |
| Web API guard | `bun web:api-routes:check` | no wrapper/backlog route is regenerated for either retired handler |
| App builds | `bun run --cwd apps/ai build && bun run --cwd apps/web build` | canonical AI and live Web compile/build after deletion |
| Repository | `bun check && git diff --check` | canonical checks pass and the diff is whitespace-clean |

## Scope

**In scope:** two Web route wrappers; complete Web external-AI library/tests;
canonical AI compatibility tests only where a retiring caller contract is not
already covered by Plans 167/293/299/303/314; AI reference wording; exact
TanStack override/manifest removal; `plans/README.md` status only.

**Out of scope:** new models/providers; billing/pricing changes; a permanent
compatibility proxy; arbitrary AI refactors; Rust implementation of retired
routes; logging request bodies/tokens; changing unrelated Web APIs; production
deployment or DNS cutover.

## Steps

1. Freeze an exact legacy-versus-canonical contract matrix from existing tests:
   accepted external-app credential/scopes, required workspace, supported
   Google model selectors, streaming/non-stream chat envelopes, WAV/PCM speech,
   request ID, idempotency, and sanitized errors. Mark intentional canonical
   differences instead of cloning legacy behavior.
2. Run the exact read-only aggregate through an authorized operator, write the
   redacted zero/nonzero result and approval to the named coordination note,
   and stop on any nonzero group. Caller migration is a separately owned
   external task, never an improvised edit in this plan.
3. Ensure the listed canonical AI plans/tests cover every retained contract,
   then delete both Web wrappers and all three duplicate implementation/test
   pairs in one change.
4. Remove matching overrides if present, regenerate the route manifest, and
   document the canonical host/retirement without implying Rust serves or will
   serve the removed routes.
5. Run canonical AI tests, route-generation checks, both app builds,
   repository/whitespace checks, and exact-scope review.

## Done criteria

- [ ] An approved 30-day inventory shows no unmigrated supported legacy caller.
- [ ] Every retained external-app contract is covered at the canonical AI host.
- [ ] Web contains no external-AI execution/auth/provider/settlement authority.
- [ ] Neither retired Web route remains in overrides or generated manifest.
- [ ] Docs identify only the canonical AI endpoints and do not claim Rust cutover.
- [ ] Every mandatory test, route, build, repository, and scope gate passes.

## STOP conditions

Stop on missing/insufficient telemetry; any supported unmigrated caller;
credential or response incompatibility without an approved migration;
CS35/G22 ownership overlap; a requirement for a permanent proxy; a canonical
AI boundary plan still unsettled; an unexpected Rust/runtime owner; or any
mandatory gate failing twice.
