# Plan 330: Make Cron Execution History Truthfully Read-Only

> **Executor instructions:** Remove broken View/Edit actions and dead copied
> mutation/mock modules from both Cron execution-history consumers. Preserve the
> top-level history route, job-detail history, queries, pagination, and all
> displayed execution fields.
>
> **Drift check (run first):**
> `git diff --stat 44742d2ced..HEAD -- 'apps/web/src/app/[locale]/(dashboard)/[wsId]/cron/executions' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/cron/jobs/[jobId]/page.tsx' apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination/20260630-234545-claude-cron-and-frontend-status.md`
> Stop on execution-detail, cron-table, cron handoff, or route-topology drift.

## Status

- **Execution status:** BLOCKED — cron/frontend handoff exact-path transfer
- **Priority:** P2
- **Effort:** S
- **Risk:** LOW
- **Category:** correctness / tech-debt / tests
- **Depends on:** explicit transfer from `20260630-234545-claude-cron-and-frontend-status.md`
- **Planned at:** commit `44742d2ced`, 2026-08-12

## Why this matters

Both the global execution-history page and each Cron job detail table advertise
View links to a route that does not exist and Edit actions that do nothing. The
shared action module also retains a dormant workspace-user DELETE request built
from Cron IDs. Two additional files are unimported copies: a model/user mutation
form and a hard-coded 2023 execution mock. The live feature is already read-only
in practice; the UI and source should state that truthfully.

## Current state and exact contract

- `apps/web/src/app/[locale]/(dashboard)/[wsId]/cron/executions/page.tsx:37-62`
  maps every row to `/${wsId}/cron/executions/${id}` and retains a commented
  `<Executions />` mock block. No `[executionId]` page exists.
- `apps/web/src/app/[locale]/(dashboard)/[wsId]/cron/jobs/[jobId]/page.tsx:23,61-66,194-203`
  imports the same execution columns and independently fabricates the same
  nonexistent detail URL. It must be included so the shared column change is
  verified for both consumers.
- `cron/executions/columns.tsx:32-46,140-145` links the job label and renders an
  actions column.
- `cron/executions/row-actions.tsx:33-50,56-90` contains a no-op Edit action,
  the broken View link, and a wrong-domain `/users` DELETE handler. The delete
  menu is currently hidden by a pathname condition but is unsafe dormant code.
- `cron/executions/form.tsx:56-82` is an unimported copy of the Models/user form.
  `cron/executions/executions.tsx:30-159` is an unimported hard-coded 2023 mock
  with private inline English/Vietnamese strings.
- Preserve the Executions tab, top-level page, job detail page, existing
  `cron-execution-data-table`/`ws-cron-executions` translations, and the current
  TanStack manifest route. No route or generated-artifact edit is needed.
- The top-level coordination note
  `tmp/agent-coordination/20260630-234545-claude-cron-and-frontend-status.md`
  remains canonical `handoff`; execution needs explicit transfer even though
  these paths are otherwise unmodified.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused test | `bun --cwd apps/web vitest run 'src/app/[locale]/(dashboard)/[wsId]/cron/executions/read-only-contract.test.ts'` | both consumers and shared columns satisfy the read-only contract |
| No false actions | `rg -n 'RowActions|/users|cron/executions/\$\{|<Executions' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/cron/executions' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/cron/jobs/[jobId]/page.tsx'` | no matches |
| No dead files | `test ! -e 'apps/web/src/app/[locale]/(dashboard)/[wsId]/cron/executions/form.tsx' && test ! -e 'apps/web/src/app/[locale]/(dashboard)/[wsId]/cron/executions/row-actions.tsx' && test ! -e 'apps/web/src/app/[locale]/(dashboard)/[wsId]/cron/executions/executions.tsx'` | exit 0 |
| Web | `bun type-check:web && bun run build:web` | typecheck and production build pass |
| Migration guard | `bun migration:tanstack:check` | existing route tracking remains current without artifact edits |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only in-scope Cron files/test and plan status changed |

## Suggested executor toolkit

- Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`.
- Use the repository's `readFileSync`/`existsSync` source-contract convention,
  for example `apps/web/src/__tests__/satellite-app-session-route-inventory.test.ts`.

## Scope

**In scope:** edit the top-level execution page, job-detail page, and shared
execution columns; delete `form.tsx`, `row-actions.tsx`, and `executions.tsx`;
create colocated `read-only-contract.test.ts`; plan status.

**Out of scope:** adding an execution detail page; editing/deleting executions;
Cron job mutation behavior; execution queries, filtering, pagination, response
types, or schema; Rust/internal-api migration; navigation/tabs; translations;
TanStack route artifacts; other Cron monitoring/control routes.

## Git workflow

- After exact handoff, use branch `fix/read-only-cron-executions` in an isolated
  worktree and run `bun setup` immediately.
- Commit: `fix(cron): make execution history read-only`.
- Do not push/open a PR unless instructed; claim the commit window before staging.

## Steps

### Step 1: Prove importer and route topology

Before deleting anything, use repository-wide `rg` to prove:

- the shared `getColumns` has exactly the top-level execution page and job-detail
  page as live consumers;
- `row-actions.tsx` is imported only by `columns.tsx`;
- `form.tsx` and `executions.tsx` have no runtime importer;
- no `[executionId]` page or supported execution mutation API exists.

Create the source-contract test and assert both consumers contain no detail URL
construction; shared columns contain no Link/RowActions/actions column; all
three dead files are absent after the change; and the directory contains no
workspace-user endpoint.

**Verify:** run Focused test before implementation; the false-action assertions
fail against the current source.

### Step 2: Remove false actions from both consumers

In the top-level page, keep the joined job label but remove only the `href`
field and commented mock block. In the job-detail page, pass `data` directly to
the shared table instead of mapping execution hrefs. Preserve locale/workspace
extra data only if another column still uses it; otherwise remove the unused
props.

In `columns.tsx`, render the job label as the same noninteractive text style,
remove `next/link`, `RowActions`, the actions column, and unused `extraData`.
Do not change any execution data column or formatting.

**Verify:** run Focused test and No false actions.

### Step 3: Delete copied dead modules

Delete `row-actions.tsx`, `form.tsx`, and `executions.tsx` after the importer
gate is clean. Do not move their inline translations into message bundles:
their only consumer is dead mock code.

**Verify:** run No dead files and Focused test.

### Step 4: Run Web and route-tracking gates

Run Web typecheck/build, migration tracking, `bun check`, scope inspection, and
whitespace checks. The existing top-level and job-detail routes must remain in
place, so aggregate TanStack artifacts must not change.

## Test plan

- Source contract covers both table consumers and shared columns.
- Prove no execution detail href, actions column, no-op edit, wrong `/users`
  endpoint, commented mock import/render, or dead copied file remains.
- Prove the job label, status, start/end, HTTP status, duration, created-at, and
  count/table calls remain present so cleanup cannot collapse history data.

## Done criteria

- [ ] Both execution-history tables are visibly read-only and preserve all current data.
- [ ] No nonexistent execution-detail link or no-op Edit action remains.
- [ ] No workspace-user request or dead copied form/mock/action file remains in this surface.
- [ ] Existing routes, tabs, translations, queries, and migration artifacts remain unchanged.
- [ ] Focused test, Web typecheck/build, migration check, `bun check`, scope, and whitespace pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if the cron/frontend handoff has not transferred these exact paths; a real
execution detail/mutation feature has landed; another importer of a deleted
module exists; shared columns now serve a third consumer with action needs;
route topology changed; or a required gate fails twice.

## Maintenance notes

If execution details are later needed, design an explicitly read-only detail
route and data contract. Editing or deleting historical executions requires a
separate authorization/audit design; never reactivate the copied user handler.
