# Plan 328: Make Workspace AI Models Truthfully Read-Only

> **Executor instructions:** Remove every false model mutation/detail affordance
> while preserving the existing workspace AI-model list route and data. Do not
> invent model CRUD or reuse another domain's API.
>
> **Drift check (run first):**
> `git diff --stat 44742d2ced..HEAD -- 'apps/web/src/app/[locale]/(dashboard)/[wsId]/(ai)/models' apps/tanstack-web/migration/route-manifest.json apps/tanstack-web/migration/route-overrides.json`
> Stop on model-page, model API, detail-route, navigation, or migration-ownership
> drift.

## Status

- **Execution status:** TODO — no active exact-path owner
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW-MEDIUM
- **Category:** correctness / security / tech-debt / tests
- **Depends on:** none
- **Planned at:** commit `44742d2ced`, 2026-08-12

## Why this matters

The Models page displays records from `workspace_ai_models`, but its Create form
and row actions call workspace-user APIs. The user-create schema strips the
model-only fields and accepts the resulting empty object, so a permitted user
can click “Create model” and create a blank CRM user instead. The page also
links every model to a detail route that does not exist and exposes an Edit
action that does nothing. Until a real model lifecycle and authorization
contract exists, the only truthful product is the already-useful read-only list.

## Current state and exact contract

- `apps/web/src/app/[locale]/(dashboard)/[wsId]/(ai)/models/page.tsx:31-70`
  reads `workspace_ai_models`, fabricates `/${wsId}/models/${id}` links, and
  passes `ModelForm` into `FeatureSummary` as a creation action.
- `models/form.tsx:32-66` defines model fields but POSTs/PUTs them to
  `/api/v1/workspaces/${wsId}/users`; its error copy also says “user”.
- `packages/users-core/src/routes/users/workspace-user-create.ts:22-35,66-89`
  accepts an object whose recognized fields are all optional. Zod strips the
  model keys, then the privileged RPC receives an empty user payload.
- `models/columns.tsx:34-48,95-100` renders the nonexistent detail link and an
  actions column. `models/row-actions.tsx:35-50,76-87` contains another
  workspace-user DELETE request, a View link, and a no-op Edit state. Delete is
  currently path-gated off, but it remains a wrong-domain dormant mutation.
- The directory has no `[modelId]` page, no model mutation route, and no focused
  test. The TanStack migration manifest registers only the existing models list
  page; preserving that page requires no route-artifact edit.
- `packages/ui/src/components/ui/custom/feature-summary.tsx:85-90,140-185`
  omits the create action when neither `form`, `href`, nor `action` is supplied.
  Keep the component for the title/description and remove only its mutation props.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused test | `bun --cwd apps/web vitest run 'src/app/[locale]/(dashboard)/[wsId]/(ai)/models/read-only-contract.test.ts'` | read-only page/column/source contract passes |
| No wrong-domain calls | `rg -n '/api/v1/workspaces/.*/users|ModelForm|RowActions|href:.*models/' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/(ai)/models'` | no matches |
| No dead files | `test ! -e 'apps/web/src/app/[locale]/(dashboard)/[wsId]/(ai)/models/form.tsx' && test ! -e 'apps/web/src/app/[locale]/(dashboard)/[wsId]/(ai)/models/row-actions.tsx'` | exit 0 |
| Route inventory | `find 'apps/web/src/app/[locale]/(dashboard)/[wsId]/(ai)/models' -maxdepth 2 -type f -print | sort` | only the read-only page, columns, and intentional focused tests/helpers remain; no detail route appears |
| Web | `bun --cwd apps/web run type-check && bun --cwd apps/web run build` | typecheck and production build pass |
| Migration guard | `bun migration:tanstack:check` | existing list-page tracking remains current without artifact edits |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only the four model files/test and plan status changed |

## Suggested executor toolkit

- Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`.
- Use the source-contract test pattern in
  `apps/web/src/__tests__/satellite-app-session-route-inventory.test.ts` for the
  regression that forbids wrong-domain calls and nonexistent detail links.

## Scope

**In scope:** edit the Models list page and columns; delete `form.tsx` and
`row-actions.tsx`; create
`apps/web/src/app/[locale]/(dashboard)/[wsId]/(ai)/models/read-only-contract.test.ts`;
plan status.

**Out of scope:** deleting the Models route/navigation; changing
`workspace_ai_models`, its query/pagination/count semantics, permissions, or DB
schema; adding model create/update/delete/detail APIs; changing workspace-user
validation; editing TanStack route artifacts; translations; other copied AI
surfaces such as Pipelines, Queues, Datasets, or Crawlers.

## Git workflow

- Branch: `fix/read-only-workspace-ai-models` in an isolated worktree; run
  `bun setup` immediately.
- Commit: `fix(ai): make workspace models read-only`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

### Step 1: Add a red read-only contract

Create a focused Vitest source/component contract. Assert that the Models page
does not import/render `ModelForm`, does not fabricate a model detail `href`,
and passes only read-only title/description props to `FeatureSummary`. Assert
that generated columns contain no `actions` column and render the model name as
plain text rather than a Link. Scan only this directory and prove it contains
no `/users` endpoint, model mutation fetch, or model-detail path.

**Verify:** run the Focused test command; the relevant assertions fail against
the current surface before implementation.

### Step 2: Remove false create and detail affordances

Delete the `ModelForm` import and the `data.map(...href)` transformation from
`page.tsx`. Pass the original records to `CustomDataTable`. Keep
`FeatureSummary` with `pluralTitle`, `singularTitle`, and `description`, but
remove `createTitle`, `createDescription`, and `form` so it renders no action.
Do not remove the route or list query.

In `columns.tsx`, remove the Link/RowActions imports and the actions column.
Render the name with the existing typography but no link/hover promise.

**Verify:** run the Focused test and No wrong-domain calls commands.

### Step 3: Delete dead wrong-domain modules

Delete `models/form.tsx` and `models/row-actions.tsx` after proving no importer
remains. Do not retain compatibility re-exports: there is no supported model
mutation contract to preserve.

**Verify:** run No dead files and Route inventory; both succeed.

### Step 4: Run Web and repository gates

Run focused tests, Web typecheck/build, migration tracking check, `bun check`,
scope inspection, and whitespace validation. Confirm the route manifest did not
change because the list route still exists at the same path.

## Test plan

- Page source/component: no form/create action, no fabricated detail href, list
  records still reach the data table, heading/description remain.
- Columns: no actions column, model name is plain text, existing id/description/
  timestamps remain.
- Directory source guard: no workspace-user endpoint or mutation fetch can be
  reintroduced under Models.
- Use synthetic model records only; no network/database calls.

## Done criteria

- [ ] The Models page remains accessible and lists existing model records.
- [ ] It exposes no create, edit, delete, or nonexistent detail affordance.
- [ ] The Models directory contains no workspace-user API call or mutation form/action module.
- [ ] No model API/schema/permission or route-migration artifact is invented.
- [ ] Focused tests, Web typecheck/build, migration check, `bun check`, scope, and whitespace pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if a real supported model mutation/detail API or route has landed; another
consumer imports either file to be deleted; removing the action requires
changing the shared `FeatureSummary`; the list route itself is being retired by
an active owner; or a required gate fails twice.

## Maintenance notes

Any future workspace-model management effort needs a separate design covering
model ownership, validation, permissions, provider synchronization, API/Rust/
TanStack parity, and lifecycle tests. Never route model-shaped data through a
workspace-user endpoint.
