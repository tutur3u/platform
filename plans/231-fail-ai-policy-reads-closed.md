# Plan 231: Fail AI Policy Reads Closed Before Editing

> **Executor instructions:** Treat either privileged policy-read error as a
> sanitized non-success so the editable panel never turns a database failure
> into an empty policy that can overwrite real settings.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/ai/src/app/api/v1/workspaces/[wsId]/ai/policy' apps/ai/src/components/policy packages/internal-api/src/ai-studio.ts packages/internal-api/src/ai-studio.test.ts tmp/agent-coordination`

## Status

- **Execution status:** TODO — no active exact-path owner; coordinate with
  adjacent external-AI policy work without expanding scope
- **Priority:** P1
- **Effort:** S
- **Risk:** LOW
- **Category:** correctness / test coverage / fail-closed UX
- **Depends on:** none
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The policy GET discards errors from both service-role reads and returns
`{global:null,policy:null}` with HTTP 200. The panel treats that as legitimate
absence, constructs editable defaults, and can save a full replacement over an
existing policy after a transient read failure.

## Current state and exact contract

- `apps/ai/.../ai/policy/route.ts` runs global and workspace policy reads in
  parallel but destructures only `data`.
- A genuine no-row result is valid and remains HTTP 200 with the corresponding
  null. Any query `error` is not absence: log server-side with native
  `console.error` and return `500 {error:'Policy read failed'}` without raw DB
  text.
- Preserve `use_ai_studio` authorization, normalized workspace binding, GET
  success shape, PATCH validation/upsert behavior, and internal-api/UI types.
- The panel's existing query error state should receive the non-2xx naturally;
  no component or form-state edit is required.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-validation-offload`, `$tuturuuu-commit`, and
`$using-git-worktrees`; read root and AI AGENTS files. Create an exact-base
isolated worktree and run `bun setup` immediately.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/ai vitest run 'src/app/api/v1/workspaces/[wsId]/ai/policy/route.test.ts'` | auth, genuine absence, both read failures, PATCH validation/upsert cases pass |
| Internal contract | `bun --cwd packages/internal-api vitest run src/ai-studio.test.ts` | existing request/response behavior remains green |
| AI app | `bun run --cwd apps/ai type-check && bun run --cwd apps/ai build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** the AI policy route and a new colocated route test. **Read-only
gates:** policy panel/form state and internal-api test. **Out of scope:** UI or
form-state changes, policy schema/fields, database/RLS, PATCH semantics,
translations, global-policy administration, or route manifests.

## Steps

1. Add an injectable route test patterned after adjacent AI route tests. Cover
   auth denial, global-read failure, workspace-read failure, both failures,
   genuine no-policy success, populated success, PATCH validation, upsert
   failure, and tenant-bound successful upsert.
2. Retain both query results, inspect each `error`, log only safe operation
   context, and return the exact sanitized 500 before serializing data.
3. Run focused/internal tests, AI typecheck/build, repository, whitespace, and
   exact-scope gates. Confirm policy components have zero diff.

## Done criteria

- [ ] No privileged GET query failure is represented as an absent policy.
- [ ] Genuine missing rows and populated rows preserve the existing 200 shape.
- [ ] No raw database error reaches the client and PATCH behavior is unchanged.
- [ ] Focused/internal tests, AI typecheck/build, repository, and whitespace
      gates pass with no component changes.

## STOP conditions

Stop on an active exact-path owner, a supported client depending on HTTP 200 for
read errors, need to change policy fields/UI/database, missing executable AI
test harness, or any mandatory gate failing twice.
