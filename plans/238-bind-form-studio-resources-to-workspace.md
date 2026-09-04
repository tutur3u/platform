# Plan 238: Bind Form Studio Resources to the Route Workspace

> **Executor instructions:** A Forms manager may mutate or create a share link
> only for a form already owned by the normalized route workspace. Fail before
> every graph or share-link write when the target is missing or foreign.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/forms/src/app/api/v1/workspaces/[wsId]/forms/[formId]/route.ts' 'apps/forms/src/app/api/v1/workspaces/[wsId]/forms/[formId]/route.test.ts' 'apps/forms/src/app/api/v1/workspaces/[wsId]/forms/[formId]/share-link' apps/forms/src/features/forms/server/mutations.ts apps/forms/src/features/forms/server tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the nonterminal Forms satellite handoff owns
  all `apps/forms/**`
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / tenant isolation / service-role containment
- **Depends on:** exact Forms application-path transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The PUT route authorizes only the workspace in the URL, then passes an arbitrary
form UUID to an admin-backed helper. That helper loads by ID alone and performs
an upsert containing the route workspace, so a manager in workspace A can
overwrite and re-home a known form from workspace B. The share-link route has
the same missing ownership check and can read or create a public code for a
foreign form.

## Current state and exact contract

- Preserve `401 {error:'Unauthorized'}`, `403 {error:'Forbidden'}`, current
  schema-validation 400s, successful `PUT {id}`, and share-link 200/201 bodies.
- After auth and UUID parsing, both routes must resolve the target by
  `forms.id = formId AND forms.ws_id = context.wsId`. Missing and foreign targets
  are intentionally indistinguishable:
  `404 {error:'Form not found'}`.
- A PUT 404 occurs before `saveFormDefinition` performs any header, section,
  question, option, logic, or media write. A share-link 404 occurs before any
  `form_share_links` read or insert.
- Defense in depth in `saveFormDefinition`: when `formId` is supplied, load and
  update by both `id` and `ws_id`; never use the current generic upsert to turn
  an existing foreign ID into a route-workspace row. Return a typed/not-found
  result that the route maps to the exact 404 above. New-form creation with no
  supplied ID remains unchanged.
- PUT database failures return exact
  `500 {error:'Failed to update form'}`. Share-link lookup failures return
  `500 {error:'Failed to load form share link'}` and insert failures return
  `500 {error:'Failed to create form share link'}`; raw database messages stay
  server-log-only and must not be misclassified as not-found.
- Share-link creation is race-safe under the existing unique constraints. On a
  `23505` form-ID conflict, re-read that form's link and return it with 200. On
  a `23505` code-only collision with no form link, generate a new code and retry
  at most three total inserts, then return the closed create 500. Other insert
  errors are not retried.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`; read `apps/forms/AGENTS.md` if present. Obtain an explicit
transfer from `20260721-224500-claude-forms-satellite-migration.md`. This plan is
schema-free and must not edit migrations or generated database types.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Form PUT | `bun --cwd apps/forms vitest run 'src/app/api/v1/workspaces/[wsId]/forms/[formId]/route.test.ts'` | same-workspace success plus foreign/missing denial pass |
| Share link | `bun --cwd apps/forms vitest run 'src/app/api/v1/workspaces/[wsId]/forms/[formId]/share-link/route.test.ts'` | existing/create, foreign/missing, auth, and DB errors pass |
| Save helper | `bun --cwd apps/forms vitest run src/features/forms/server/mutations.test.ts` | scoped existing update and new-create behavior pass |
| Forms | `bun run --cwd apps/forms type-check && bun run --cwd apps/forms build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** form item PUT and its test; share-link GET and a new colocated
test; the existing-form branch of `saveFormDefinition` and focused helper test;
one small typed result/error helper if needed. **Out of scope:** GET/DELETE
semantics already scoped by workspace, response submission, public form reads,
share-code format, media signing, schema/migrations, and the multi-table
atomicity work in Plan 241.

## Steps

1. Characterize cookie and Forms app-session auth, permissions, invalid UUID,
   invalid body, same-workspace update, existing/new share link, and exact
   success bodies. Add red foreign/missing cases and assert zero downstream
   writes.
2. Add one injectable form-ownership resolver that queries only `id,ws_id` with
   both predicates. Distinguish query failure from zero rows; expose no foreign
   metadata.
3. Gate PUT before `saveFormDefinition`. In the helper, replace existing-form
   upsert with a scoped update using `.eq('id', formId).eq('ws_id', wsId)` and
   require one returned ID before child writes. Keep new-form insert separate.
4. Gate share-link lookup and creation with the same resolver. Inspect lookup
   errors and implement the exact form-conflict re-read/code-collision retry
   contract above while preserving existing 200/201 response bodies; no foreign
   form may reach either share-link query.
5. Run focused tests, Forms typecheck/build, repository, whitespace, and exact
   scope gates.

## Done criteria

- [ ] Foreign and missing forms return the same closed 404 before any write.
- [ ] Existing form updates cannot change `forms.ws_id` or overwrite a foreign
      form through the admin client.
- [ ] Share links are read/created only after same-workspace form proof.
- [ ] New-form creation and all supported success envelopes remain unchanged.
- [ ] Focused tests, Forms typecheck/build, `bun check`, and whitespace pass.

## STOP conditions

Stop on unresolved Forms ownership, another supported writer that bypasses the
helper contract, required schema work, production apply need, response-envelope
drift outside the closed 404, or any mandatory gate failing twice.
