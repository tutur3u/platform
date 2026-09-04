# Plan 241: Save Form Definitions Atomically Without Detaching Answers

> **Executor instructions:** Replace the destructive multi-request save with
> one workspace-bound transaction that preserves IDs for retained questions.
> A failed save changes nothing, and a successful edit never nulls historical
> answers merely because a question remained in the form.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/forms/src/features/forms/server/mutations.ts apps/forms/src/features/forms/server 'apps/forms/src/app/api/v1/workspaces/[wsId]/forms' apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — Plans 154/163, Plan 238, and the Forms plus
  database/generated-type owners must clear
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** correctness / transactionality / historical response integrity
- **Depends on:** Plans 154, 163, and 238; Forms and database/type transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

`saveFormDefinition` upserts the header, deletes logic, then deletes every
question and section before independent reinserts. Any later failure leaves a
partially destroyed form. Even a successful save deletes retained question IDs
first; the existing `form_response_answers.question_id ON DELETE SET NULL`
therefore detaches historical answers from questions that were not actually
removed.

## Current state and exact contract

- Preserve the validated Forms Studio input and successful `{id}` route
  envelope. New client-side IDs remain UUIDs generated before dispatch.
- Add exact service-role-only RPC:
  `private.save_form_definition_atomically(p_ws_id uuid, p_creator_id uuid,
  p_form_id uuid, p_header jsonb, p_sections jsonb, p_questions jsonb,
  p_options jsonb, p_logic_rules jsonb) returns uuid`. `p_form_id = null`
  creates a new form ID; non-null updates only a form already in `p_ws_id`.
- `p_header` permits exactly `title,description,status,access_mode,open_at,
  close_at,max_responses,theme,settings,published_at,closed_at`. Every array row
  has a concrete UUID and only the current storage columns constructed by the
  server helper: sections `id,title,description,position`; questions
  `id,section_id,type,title,description,required,position,image,settings`;
  options `id,question_id,label,value,image,position`; logic rules
  `id,trigger_type,source_question_id,source_section_id,operator,
  comparison_value,action_type,target_section_id,priority`.
- The function rejects unknown keys, duplicate IDs, child IDs currently owned
  by another form/question, and any parent/reference outside the submitted
  same-form graph with named `FORM_DEFINITION_INVALID` (route 400
  `{error:'Invalid form definition'}`). Missing/foreign update target raises
  `FORM_NOT_FOUND` (route 404 `{error:'Form not found'}`). Unexpected failures
  map by caller to exact closed bodies: collection POST
  `500 {error:'Failed to create form'}`, item PUT
  `500 {error:'Failed to update form'}`, and copy POST
  `500 {error:'Failed to copy form'}`. Raw database messages are server-log-only.
- Lock an existing form row. Upsert submitted sections, questions, options, and
  logic rules by stable IDs, then delete only IDs omitted from the submitted
  graph in dependency order. Retained question IDs must never be deleted, so
  their historical `form_response_answers.question_id` values remain intact.
- An intentionally removed question may retain current FK behavior and null
  historical answer links; characterize that behavior rather than silently
  deleting response rows.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$supabase-postgres-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Execute from completed Plan 163 only after Plan 154 is green
and Plan 238 has closed the route-workspace boundary. Obtain exact Forms and
database/type ownership transfer. Never apply production migrations.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Forms helper/route | `bun --cwd apps/forms vitest run src/features/forms/server/mutations.test.ts 'src/app/api/v1/workspaces/[wsId]/forms/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/forms/[formId]/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/forms/[formId]/copy/route.test.ts'` | create/update/copy, stable IDs, and error mapping pass |
| Focused/full DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/form-definition-save.sql && bun --cwd apps/database sb:validate:isolated` | rollback, graph validation, answer preservation, ACLs, and full suite pass |
| Typegen | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/form-definition-save.sql` | exact RPC types generated with no unrelated drift |
| Forms | `bun run --cwd apps/forms type-check && bun run --cwd apps/forms build` | both exit 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** normalized save payload builder/helper and tests; form collection,
item, and copy route regression tests; one additive migration; one pgTAP file;
generated DB types. Split the helper before substantial editing so every
authored module stays below 700 LOC. **Out of scope:** response submission,
analytics/export, share links beyond Plan 238, public form reads, media upload or
signing, autosave UX, production apply, and changing question/answer retention
policy for intentionally removed questions.

## Steps

1. Characterize create, edit, copy, media sanitization, timestamps, generated
   IDs, logic references, and exact route errors. Add red fault injection after
   every current write stage and prove current retained-question saves detach
   an answer.
2. Extract a pure payload builder that resolves every section/question/option/
   rule UUID before the RPC, applies existing media sanitization and
   `requireTurnstile:true`, and emits only the closed JSON keys above.
3. Create the exact RPC with fixed `search_path`, strict JSON type/key checks,
   form-row locking, same-form ownership validation, stable-ID upserts, and
   stale-ID deletes in dependency order. Make the whole function one
   transaction. Revoke the exact signature from PUBLIC, `anon`, and
   `authenticated`; grant only `service_role`.
4. Route all three supported save callers (collection create, item update, and
   copy) through the same helper/RPC. Map only the two named errors to their
   closed 400/404 bodies; do not fall back to direct table writes.
5. Add pgTAP for create, update, copy-shaped create, retained-answer linkage,
   intentional removal, foreign target, foreign child ID, duplicate/reference
   errors, each injected failure rollback, retry, and function ACLs.
6. Run focused/full DB, isolated typegen, Forms typecheck/build, repository,
   source-size, whitespace, and exact-scope gates.

## Done criteria

- [ ] Every definition save commits completely or leaves all form tables
      unchanged.
- [ ] Retained section/question/option/rule IDs remain stable across edits.
- [ ] Historical answers keep their question ID when that question remains.
- [ ] The RPC is workspace-bound, graph-validating, and service-role-only.
- [ ] Create/item/copy routes preserve supported success and error envelopes.
- [ ] Focused/full DB, typegen, Forms typecheck/build, repository, and
      whitespace gates pass.

## STOP conditions

Stop on red Plan 154 baseline, unresolved Forms/database ownership, historical
invalid cross-form child IDs, a supported save caller outside the three named
routes, inability to preserve retained IDs, need to change intentional-removal
retention policy, production apply need, or any mandatory gate failing twice.
