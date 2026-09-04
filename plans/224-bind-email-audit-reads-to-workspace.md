# Plan 224: Bind Email Audit Reads to the Authorized Workspace

> **Executor instructions:** Close both admin-client email-audit read paths with
> one canonical workspace boundary. Preserve the existing Infrastructure
> permission and response/UI contracts; do not turn a workspace route into a
> root-global audit surface.
>
> **Drift check (run first):**
> `git diff --stat 968bd12018..HEAD -- 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/email-audit' 'apps/infrastructure/src/app/api/v1/workspaces/[wsId]/settings/email-audit' apps/infrastructure/src/lib/email-audit-data.ts apps/infrastructure/src/lib/email-audit-data.test.ts packages/internal-api/src/infrastructure tmp/agent-coordination`

## Status

- **Execution status:** TODO
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** security / tenant isolation / tests
- **Depends on:** none
- **Planned at:** commit `968bd12018`, 2026-08-11

## Why this matters

Both workspace-facing email-audit loaders authorize a member in one workspace
and then query `email_audit` with a service-role client without constraining the
rows to that workspace. The result exposes recent sender addresses, subjects,
providers, statuses, and other audit metadata from unrelated tenants.

## Current state and exact contract

- `apps/infrastructure/src/app/api/v1/workspaces/[wsId]/settings/email-audit/route.ts:35-52`
  requires `view_infrastructure`, but the admin query orders and limits the
  global table without `.eq('ws_id', ...)`.
- `apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/email-audit/page.tsx:54-71`
  authorizes the page, then calls `getData(sp)` without a workspace argument.
  Its query at lines 269-346 reads, searches, counts, and pages the global table.
- The stats RPC in both surfaces already accepts `filter_ws_id`; keep that
  behavior, but pass `permissions.wsId`, the canonical workspace ID returned by
  `getPermissions`, rather than the unresolved route alias.
- Keep `view_infrastructure`, existing 403/not-found behavior, page filters,
  projections, sort, limits, count semantics, and JSON/UI envelopes unchanged.
  Root-workspace actors using a workspace URL must still see only that URL's
  workspace. Any future global audit needs a separate explicitly authorized
  endpoint and is out of scope.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$vercel-react-best-practices`, and `$tuturuuu-commit`. Read root instructions.
Confirm no active note owns the exact email-audit page/route/helper paths and
record the work in a coordination note.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused data/route | `bun --cwd apps/infrastructure vitest run src/lib/email-audit-data.test.ts src/app/api/workspace-settings-routes.test.ts` | foreign-workspace rows are impossible; permission/error/current-envelope cases pass |
| Typecheck | `bun run --cwd apps/infrastructure type-check` | exit 0 |
| Build | `bun run --cwd apps/infrastructure build` | production build exits 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** the full email-audit page loader; the native settings email-audit
route; a focused injected server-only data helper and tests; the existing
settings route contract test if needed.

**Out of scope:** email sending/writes, retention, table/RLS/schema changes,
permissions redesign, global/root audit UX, unrelated Infrastructure pages,
internal-api response changes, or translations.

## Steps

1. Add red tests around an injected admin-query seam for canonical workspace
   selection, route aliases, list/count/stat queries, filters, and a foreign-row
   fixture. Assert authorization failure occurs before any admin query.
   **Verify:** tests fail because both live loaders omit the tenant predicate.
2. Extract the smallest shared server-only email-audit read boundary. Require a
   non-empty canonical `wsId` and apply `.eq('ws_id', wsId)` before search,
   ordering, range, limit, and execution for every list/count projection. Keep
   stats on the same canonical ID. **Verify:** no workspace-facing email-audit
   admin query exists outside the tested boundary.
3. Pass `permissions.wsId` from the page and API route. Preserve current
   permission, error, filter, paging, JSON, and rendered-table contracts.
4. Run focused, typecheck, Infrastructure build, repository, whitespace, and
   exact-scope gates.

## Done criteria

- [ ] A member authorized in workspace A cannot read or count any workspace B
      email-audit row through either live Infrastructure surface.
- [ ] Route aliases are normalized once and every admin read uses
      `permissions.wsId`.
- [ ] Existing permission, filter, paging, sort, stats, response, and UI
      contracts are unchanged.
- [ ] Focused/typecheck/build/repository/whitespace gates pass.

## STOP conditions

Stop on newly discovered global-audit requirements, inability to bind a query
before execution, unexpected response/permission drift, active exact-path
ownership, or any mandatory gate failing twice.
