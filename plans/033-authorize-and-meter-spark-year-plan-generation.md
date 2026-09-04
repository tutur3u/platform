# Plan 033: Authorize and Meter Spark Year-Plan Generation

> **Executor instructions:** Replace Spark's legacy re-export with a
> first-class Web route that validates bounded input, authorizes the submitted
> workspace, and applies the platform AI-credit lifecycle before streaming. Run
> every gate and update this plan's row in `plans/README.md` when complete.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- packages/ai/src/object/year-plan apps/web/src/legacy-api-routes/ai/objects/year-plan apps/web/src/app/api/ai/objects/year-plan 'apps/web/src/app/[locale]/(dashboard)/[wsId]/ai/spark' apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json`
> Stop on material Spark, AI metering, route ownership, or migration-manifest
> drift.

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / AI metering / API migration
- **Depends on:** G22 route-artifact ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

Execution is blocked while
`tmp/agent-coordination/20260707-141449-codex-g22-time-roles-templates.md`
retains coordinator ownership of `route-overrides.json` and
`route-manifest.json`, both required by the first-class Web route move.

## Why this matters

Spark submits the visible workspace, but the route only verifies a cookie user
and whitelist entry. It trusts that workspace for memory attribution without
membership, accepts unbounded arrays/strings, and never checks or deducts AI
credits. Any whitelisted user can attribute provider work to another tenant or
consume unmetered generation with oversized prompts.

## Current state

- `packages/ai/src/object/year-plan/route.ts:30-75` casts unchecked JSON and
  leaves all field validation commented out.
- Lines 83-96 establish only cookie authentication and whitelist status; no
  workspace permission is checked.
- Lines 98-181 expand caller arrays into a prompt and attribute memory to the
  caller-selected `wsId`, with an 8,192-token output cap but no credit lifecycle.
- `apps/web/src/legacy-api-routes/ai/objects/year-plan/route.ts` re-exports the
  package handler; the generated App route wraps that legacy file.
- Spark's guarded page passes its normalized workspace at
  `client-page.tsx:20-28`, but the API does not independently trust that guard.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`, and
`$tuturuuu-agent-coordination`. Read `apps/web/AGENTS.md`. Follow the Web legacy
route extraction and TanStack migration-manifest rules exactly.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route tests | `bun --cwd apps/web vitest run 'src/app/api/ai/objects/year-plan/route.test.ts'` | validation, tenant, and credit cases pass |
| Package tests | `bun run --cwd packages/ai test` | shared schema behavior passes |
| Migration manifest | `bun migration:tanstack:manifest` | override/manifest matches first-class route ownership |
| Migration check | `bun migration:tanstack:check` | generated migration artifacts are current |
| Typechecks | `bun run --cwd apps/web type-check && bun run --cwd packages/ai type-check` | both exit 0 |
| Repository gate | `bun check` | exit 0 |
| Web build | `bun run --cwd apps/web build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- First-class `apps/web/src/app/api/ai/objects/year-plan/route.ts` plus test
- Delete the matching legacy route and obsolete shared route implementation
  after proving no other importer remains; retain reusable schemas/types
- Spark request types/client only if required to align the bounded contract
- Matching TanStack route override and `route-manifest.json` entry

Do not redesign Spark UI, change the output schema/model without pricing
evidence, or implement the proposed Task-project product direction.

## Git workflow

- Branch: `fix/spark-year-plan-boundary` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(web): authorize Spark year plans`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Extract and validate the first-class route

Move the implementation and any colocated test out of the legacy tree. Define
a strict Zod schema with bounded goal count/length, focus/skill/dependency
counts and lengths, duration, weekly availability, enums, and total request
size. Reject malformed JSON and unknown fields before privileged or provider
work while preserving current valid UI payloads.

### Step 2: Authorize the actor and normalized workspace

Resolve the authenticated Web actor, normalize `wsId` with the request client,
and require the same workspace access used by the guarded page. Keep whitelist
as an additional feature gate, not authorization. Use only normalized ids for
memory, credits, and logs. Return canonical 401/403/422/500 outcomes without
revealing tenant existence.

### Step 3: Apply AI-credit policy and settlement

Resolve the model's canonical pricing id, check credits before model creation,
cap output tokens by available credits, and attribute `withAiMemory` to the
authorized actor/workspace. Capture final usage and complete or durably record
credit settlement exactly once; do not fire-and-forget. Match established AI
error envelopes and never expose provider/database detail.

### Step 4: Update migration tracking and prove isolation

Delete the legacy/shared handler only after `rg` proves it has no consumers.
Update the route override whose id embeds the old source file and regenerate the
manifest. Test anonymous, nonmember, malformed/oversized, exhausted-credit,
provider-failure, successful-stream, and settlement-failure cases, including
two workspace ids.

## Test plan

- Create the first-class route test beside the handler, modeled on an existing
  metered Web AI route test.
- Cover malformed/oversized input, anonymous, nonmember, lookup failure,
  whitelist denial, exhausted credits, provider failure, successful usage, and
  unsuccessful settlement.
- Assert current Spark payload/output compatibility and cross-workspace
  isolation.

## Done criteria

- [ ] Every accepted workspace is normalized and authorized server-side before
      memory/provider work.
- [ ] Input is schema- and size-bounded before prompt construction.
- [ ] Credits are checked, output-capped, attributed, and settled exactly once.
- [ ] The legacy route is removed and migration tracking names the first-class
      source.
- [ ] Current Spark response shape remains compatible.
- [ ] Focused/package tests, manifest generation, typechecks, `bun check`, Web
      build, and whitespace pass.

## STOP conditions

Stop if the model has no canonical pricing entry, stream usage cannot be
settled reliably, another consumer imports the shared handler, or Spark's
workspace access policy is product-ambiguous. Do not keep an unmetered fallback.

## Maintenance notes

Plan 025 is the Teach analogue; reuse its authorization/metering shape where
possible without coupling the Web and satellite route boundaries.
