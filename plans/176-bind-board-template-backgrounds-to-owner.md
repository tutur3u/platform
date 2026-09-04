# Plan 176: Bind Board-Template Backgrounds to Their Owner

> **Executor instructions:** Prevent templates from signing caller-selected
> foreign storage objects and prevent generic member-driven deletion of another
> owner's background. Keep legacy same-workspace templates readable.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- 'apps/tasks/src/app/api/v1/workspaces/[wsId]/templates' 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/templates' apps/tasks/src/components/settings/template-marketplace-actions.ts packages/tasks-ui/src/tu-do/templates packages/ui/src/lib/template-background.ts apps/database/supabase/migrations apps/database/supabase/tests packages/types/src/supabase.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** security / storage / authorization
- **Depends on:** Plans 082, 154, and 163 (DONE); broad Tasks and
  database/generated-type ownership transfer
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

A template owner can store an arbitrary `workspaces` bucket path and receive an
admin-signed URL through the template serializer. Separately, any workspace
member can ask the generic background endpoint to delete any object under the
workspace template prefix. Stored provenance and destructive ownership are not
bound to the template actor.

## Current state

- Template create and PATCH accept caller-selected `backgroundPath` without
  proving workspace/actor provenance.
- `serializeBoardTemplate` signs the stored path with the admin client; the
  marketplace reader also signs without validating the template workspace.
- DELETE `/templates/background` checks only
  `<wsId>/template-backgrounds/`, not template ownership or row references.
- The edit dialog is the only caller of `deleteTemplateBackground`; it PATCHes
  first and then sends the old path to the generic destructive endpoint.
- Direct authenticated writes to `board_templates` are granted but no live
  source mutation bypassing the admin-backed routes was found.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-database`, `$supabase`,
`$tuturuuu-agent-coordination`, `$tuturuuu-commit`, and
`$vercel-react-best-practices`. Read root/database/Tasks AGENTS and Plan 082.
Inventory storage policies and every board-template mutation before revoking
direct writes.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Template routes | `bun --cwd apps/tasks vitest run 'src/app/api/v1/workspaces/[wsId]/templates/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/templates/[templateId]/route.test.ts' 'src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/templates/route.test.ts'` | provenance, signing, cleanup, and legacy cases pass |
| Focused DB | `bun --cwd apps/database sb:validate:isolated --test supabase/tests/board-template-write-boundary.sql` | authenticated writes denied; service route boundary preserved |
| Full DB | `bun --cwd apps/database sb:validate:isolated` | every pgTAP file passes |
| Isolated types | `bun --cwd apps/database sb:validate:isolated --typegen packages/types/src/supabase.ts --test supabase/tests/board-template-write-boundary.sql` | no unexpected type drift |
| Tasks UI | `bun run --cwd packages/tasks-ui type-check && bun run --cwd packages/ui type-check` | exit 0 |
| Tasks app | `bun run --cwd apps/tasks type-check && bun run --cwd apps/tasks build` | exit 0 |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** shared strict path validator; upload-url, create, PATCH, serializer,
marketplace signing, and owner-bound cleanup; retire the generic deletion client
and endpoint if the caller inventory remains singular; one write-boundary
migration/test; focused route tests.

**Out of scope:** Plan 082's publication permission fix; orphan-upload garbage
collection; changing the bucket; public template content; production apply.

## Git workflow

Use `fix/bind-template-backgrounds` after Plan 082 from the completed Plan 163
isolated-typegen base and commit
`fix(tasks): bind template backgrounds to owners`. Claim/release the commit
window; do not push.

## Steps

1. Characterize new and legacy paths. New uploads must use the exact normalized
   `<wsId>/template-backgrounds/<actorId>/<uuid>_<safeName>` prefix. Reject
   traversal, another workspace, another actor, empty segments, and paths not
   issued by the upload contract.
2. Reuse that validator in Plan 082's create route and the owner PATCH route.
   Construct bodies explicitly. Before signing, require at minimum the stored
   template workspace prefix; refuse/log cross-workspace legacy paths and return
   `backgroundUrl: null`. Continue reading valid legacy same-workspace paths.
3. Move replacement cleanup into the owner-scoped PATCH transaction flow: load
   the existing owner/workspace/path, persist the new validated path, then
   best-effort delete only that exact prior path. A storage cleanup failure must
   remain server-logged and must not roll back or misreport the successful row
   update. Remove the generic caller-selected deletion endpoint/helper after
   proving no other caller.
4. Revoke direct INSERT/UPDATE/DELETE on `board_templates` from authenticated,
   retain SELECT/RLS and service-role route access, and pgTAP the privilege
   boundary. If a live direct writer is found, STOP and migrate it explicitly.
5. Test foreign signing, another owner's path, another owner's deletion,
   replacement cleanup, cleanup failure, null removal, legacy same-workspace
   read, app session, and no-row ownership. Run disposable DB, typegen, focused
   UI/routes, Tasks build, and repository gates.

## Done criteria

- [ ] New stored background paths are workspace- and actor-bound.
- [ ] No serializer signs a cross-workspace template path.
- [ ] A member cannot delete another template owner's referenced object.
- [ ] Direct authenticated template writes cannot bypass route validation.
- [ ] Legacy same-workspace templates remain readable; all mandatory gates pass.

## STOP conditions

Stop on Plan 082/ownership overlap, another generic deletion caller, a required
direct authenticated writer, ambiguous legacy cross-workspace data, unexpected
type drift, a red Plan 154 baseline, or a mandatory gate failing twice.
