# Plan 025: Authorize and Meter Teach Object Generation

> **Executor instructions:** Replace the three Teach re-export handlers with
> first-class, satellite-aware handlers. Authorize the submitted workspace
> before any admin query or model call, and apply the existing AI-credit
> contract without changing the streamed response shapes.
>
> **Drift check (run first):**
> `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/teach/src/app/api/ai/objects packages/ai/src/object packages/internal-api/src/education.ts apps/teach/src/lib/api-auth.ts packages/education-core/src/teach/api.ts`
> Stop on material route, auth-wrapper, permission, or metering drift.

## Status

- **Execution status:** BLOCKED
- **Blocked by:** mandatory Teach production build repeatedly fails in the
  current execution environment with Turbopack `EPERM` while creating its CSS
  worker process/internal port; reviewed uncommitted work remains in
  `.worktrees/fix-teach-object-generation-auth`
- **Priority:** P0
- **Effort:** M
- **Risk:** MED
- **Category:** Security / Correctness / AI metering
- **Depends on:** none
- **Planned at:** commit `68a1457aed`, 2026-08-10

## Why this matters

The quiz, quiz-explanation, and flashcard endpoints accept a caller-selected
workspace, check only that some Supabase-cookie user exists, then use an admin
client and that workspace's `ENABLE_CHAT` flag. A signed-in caller can therefore
spend another workspace's provider allowance, while a valid Teach app-session
caller without a Supabase cookie is rejected. The calls also bypass the
platform's AI-credit check, output cap, and deduction path.

## Current state

- `packages/ai/src/object/quizzes/route.ts:25-50` trusts body `wsId`, resolves
  only `supabase.auth.getUser()`, and admin-queries `workspace_secrets` without
  proving membership. Its model call starts at line 68 with no credit handling.
- `packages/ai/src/object/quizzes/explanation/route.ts` and
  `packages/ai/src/object/flashcards/route.ts` repeat the same boundary.
- The only consumers are the three one-line re-exports under
  `apps/teach/src/app/api/ai/objects/**`; Teach UI and
  `packages/internal-api/src/education.ts:277-296` call those local paths.
- `apps/teach/src/app/api/ai/quiz/route.ts:60-343` is the canonical pattern:
  `withSessionAuth` with target `teach`, `requireTeachWorkspaceAccess`, Zod
  parsing, `checkAiCredits`, `capMaxOutputTokensByCredits`, `withAiMemory`, and
  usage deduction. Match its error/status conventions and its
  `update_user_groups` / `view_user_groups` access boundary.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`, and
`$tuturuuu-agent-coordination`. Read the nearest `AGENTS.md`, inspect active
notes, and do not start while another owner claims these exact routes.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused tests | `bun --cwd apps/teach vitest run src/app/api/ai/objects/**/*.test.ts` | auth, tenant, validation, provider, and credit cases pass |
| Teach tests | `bun run --cwd apps/teach test` | exit 0 |
| Typechecks | `bun run --cwd apps/teach type-check && bun run --cwd packages/ai type-check && bun run --cwd packages/internal-api type-check` | all exit 0 |
| Repository gate | `bun check` | exit 0 |
| Teach build | `bun run --cwd apps/teach build` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

- `apps/teach/src/app/api/ai/objects/quizzes/route.ts` and a colocated test
- `apps/teach/src/app/api/ai/objects/quizzes/explanation/route.ts` and test
- `apps/teach/src/app/api/ai/objects/flashcards/route.ts` and test
- A small shared schema/helper below `apps/teach/src/app/api/ai/objects/`
- Delete the three superseded `packages/ai/src/object/**/route.ts` files after
  proving no imports remain; retain shared schemas/types that still have users
- `packages/internal-api/src/education.ts` only if its typed error contract must
  be aligned; do not change the URL or success payload

Do not change quiz/flashcard JSON shapes, prompts, models, course persistence,
permissions, or unrelated AI routes. Do not introduce a database migration.

## Git workflow

- Branch: `fix/teach-object-generation-auth` in an isolated worktree; run
  `bun setup` immediately.
- Conventional Commit: `fix(teach): authorize AI object generation`.
- Do not push/open a PR unless instructed. Claim the commit window before
  staging; never stage coordination notes.

## Steps

### Step 1: Characterize and validate each request

Move the three implementations to their Teach route files. Add Zod schemas for
the existing required fields and reject malformed JSON, empty strings, unknown
fields, and wrong object shapes with 400 before creating an admin client or AI
provider. Preserve currently valid client payloads.

**Verify:** malformed-body tests make zero authz-admin, credit, memory, or
provider calls; current UI payload fixtures still pass parsing.

### Step 2: Establish the canonical Teach actor and workspace boundary

Wrap each handler with `withSessionAuth` using
`allowAppSessionAuth: { targetApp: 'teach' }` and the same intentional temp-auth
policy as the canonical quiz route. Call `requireTeachWorkspaceAccess` with the
submitted `wsId` and the quiz-edit permission pair before reading
`workspace_secrets` or creating AI dependencies. Use only `normalizedWsId`,
`context.user.id`, and the returned admin client afterward.

Return 401 for no actor, 403 for a nonmember/unpermitted actor, and 500 for an
authorization lookup failure. Keep `ENABLE_CHAT` as a feature gate after
authorization; its absence must not reveal workspace existence.

**Verify:** app-session-only success passes; anonymous, wrong-target session,
cross-workspace member, and missing-permission cases make zero provider calls.

### Step 3: Apply credit checks, caps, memory attribution, and settlement

For each fixed model, use its canonical stable model id for
`checkAiCredits` and `capMaxOutputTokensByCredits`. Attribute `withAiMemory` to
the authorized actor and normalized workspace. Capture final usage and deduct
credits with a stable feature/surface name. Await or otherwise prove completion
of the deduction lifecycle before the request's server work can disappear;
log failures server-side without exposing provider/database detail.

**Verify:** exhausted credits return the canonical 403 before provider setup;
successful completion records the same normalized workspace, actor, model, and
token usage in the credit/memory mocks exactly once.

### Step 4: Remove the insecure shared handlers and run gates

Delete the three package route implementations only after `rg` proves Teach was
their sole importer. Keep reusable `object/types` schemas if still imported.
Run every command in the table, including the real Teach build.

## Done criteria

- [ ] All three routes accept a valid Teach app session and reject anonymous,
      wrong-target, nonmember, and unpermitted callers before privileged work.
- [ ] Caller body `wsId` is never used after canonical normalization.
- [ ] Every provider call is credit-checked, output-capped, actor/workspace
      attributed, and deducted exactly once from final usage.
- [ ] Success response shapes and current Teach callers remain compatible.
- [ ] The obsolete shared route implementations have no remaining import.
- [ ] Focused tests, Teach tests/typecheck/build, package typechecks,
      `bun check`, and whitespace pass.

## STOP conditions

Stop if any non-Teach consumer imports these handlers, if the three models lack
canonical pricing entries, if reliable stream settlement needs a new durable
reservation design, or if product owners require a permission other than the
canonical quiz-edit pair. Do not silently keep an unmetered fallback.

## Maintenance notes

Keep authorization before `ENABLE_CHAT`, model setup, and all admin-backed
lookups. Plan 027 assumes these routes no longer return stack traces; execute it
after this plan when performing the package-wide error-envelope sweep.
