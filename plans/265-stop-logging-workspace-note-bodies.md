# Plan 265: Stop Logging Workspace Note Bodies

> **Executor instructions:** Remove the unconditional workspace-note request-body
> log without changing the Notes API contract, and prove neither valid nor
> rejected note content reaches server logs.

> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/notes/route.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/notes/route.test.ts' 'apps/web/src/app/api/v1/workspaces/[wsId]/notes/route.ts' tmp/agent-coordination`

## Status

- **Execution status:** TODO
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** security / log privacy
- **Depends on:** none
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The live workspace Notes POST logs the complete JSON body before validation.
That body includes the note title and recursive rich-text document, so both
successful and malformed requests copy private workspace content into the
server logging boundary and its separate access/retention systems.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Confirm the first-class App Router file remains a generated
wrapper and that this change is a narrow log deletion rather than a route
rework. If broader route behavior must change, stop and apply the full
first-class route-move contract instead.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/web vitest run 'src/legacy-api-routes/v1/workspaces/[wsId]/notes/route.test.ts'` | valid and invalid unique content never appears in any `console.*` argument |
| Retired log | `rg -n "console\\.(log|info|debug)\\([^\\n]*(body|content|title)" 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/notes/route.ts'` | exit 1, no output |
| Web checks | `bun type-check:web && bun --cwd apps/web run build` | types and real Next build pass |
| Repository | `bun check && git diff --check` | all checks and whitespace pass |

## Scope

In scope: remove the one body log; add a focused colocated route test covering
valid and schema-invalid bodies; retain sanitized error logging already present.

Out of scope: Notes pagination, response shapes, authorization, schemas,
database changes, Rust/TanStack migration ownership, log-drain architecture, or
moving the route merely for this one-line privacy fix.

## Steps

1. Add a red route test with unique title/content sentinels. Spy on every
   `console.*` method and prove the current POST exposes them for both a valid
   note and a rejected body.
2. Delete the unconditional body log. Do not add title, rich text, attributes,
   or the raw body to another structured log.
3. Keep existing status codes, validation, membership checks, insert payload,
   response body, and sanitized database error behavior byte-for-byte where
   practical.
4. Run the focused, retired-log, Web typecheck/build, repository, whitespace,
   and exact-scope gates.

## Done criteria

- [ ] No valid or invalid workspace-note title/content reaches server logs.
- [ ] POST authorization, validation, persistence, and response contracts are unchanged.
- [ ] The generated first-class wrapper and migration artifacts are unchanged.
- [ ] Focused, typecheck, build, repository, and whitespace gates pass.

## STOP conditions

Stop if the App Router file is no longer a generated wrapper, the live route has
drifted into a first-class implementation, a supported caller depends on the
log side effect, broader route behavior must change, another owner claims the
exact handler/test, or any mandatory gate fails twice.
