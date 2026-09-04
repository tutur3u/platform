# Plan 166: Preserve Partial Bulk User-Merge Results for Review

> **Executor instructions:** Keep destructive user merges sequential. When a
> bulk response is partial, remove only successful pairs and retain every failed
> pair with a stable public failure code for deliberate review; never
> auto-retry an ambiguous
> merge.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd9..HEAD -- packages/users-core/src/routes/users/merge-bulk.ts packages/users-core/src/routes/users/merge-bulk.test.ts packages/types/src/primitives/WorkspaceUserMerge.ts packages/internal-api/src/users.ts packages/internal-api/src/users.test.ts 'apps/contacts/src/app/[locale]/[wsId]/users/database/components/duplicate-users-dialog.tsx' 'apps/contacts/src/app/[locale]/[wsId]/users/database/components/duplicate-users-dialog.test.tsx' apps/contacts/messages/en.json apps/contacts/messages/vi.json apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** correctness / tests
- **Depends on:** Contacts database handoff and G22 route-artifact transfers
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The server deliberately permits partial success across up to 100 sequential,
destructive merges and already returns a result for every pair. The Contacts
dialog warns about failures and then immediately clears every duplicate
cluster, discarding the exact pairs that still need attention. Transport
failure is also inherently ambiguous, so automated retries could repeat a
merge that already committed.

## Current state

- `packages/users-core/src/routes/users/merge-bulk.ts:23-30` accepts 1-100
  pairs; lines 122-237 validate once, invoke the security-definer merge RPC
  sequentially, and accumulate per-pair success/failure.
- The route has no focused tests for authorization, invalid sets, mid-batch
  failure, result ordering, or thrown RPC calls.
- `duplicate-users-dialog.tsx:399-448` sends every filtered cluster with raw
  `fetch`. If `failCount > 0` it shows a warning but still calls
  `handleMergeComplete`; lines 456-463 then clear every cluster.
- No dialog test covers the bulk path. The separately deferred persisted merge
  job concerns interruption inside one multi-table merge and does not cover
  this wrapper's already-returned partial results.

## Exact behavior contract

- Preserve server request order and exactly one result per submitted pair.
- On a 2xx response, remove clusters only for results with `success: true`.
  Retain failed clusters, their selected targets, and a displayable sanitized
  per-pair error. Stay in review state and invalidate workspace users so
  successful merges refresh.
- The bulk public failure contract is closed: add a separate discriminated
  `BulkMergeResult` used only by `BulkMergeUsersResponse`. Its failure member is
  `{ success: false, sourceUserId, targetUserId, errorCode: 'merge_failed',
  migratedTables: [], collisionTables: [], customFieldsMerged: 0 }`; its success
  member retains the existing successful merge fields. Leave the existing
  `MergeResult.error` and `PhasedMergeResult` contracts untouched for the
  separate single/phased flow. The bulk route logs raw details server-side only;
  the Contacts UI maps `merge_failed` to bilingual copy. Do not return or render
  `error.message`, `rpcResult.error`, or caught exception text in bulk results.
- Route-level validation keeps its existing stable 4xx messages. Membership
  lookup, workspace-user lookup, and unexpected 500 paths return a stable
  generic message with no Supabase/exception `error` field; internal detail is
  logged server-side only.
- Complete/close only when every submitted result succeeded and no clusters
  remain.
- On non-2xx, parse failure, timeout, or network failure, retain every submitted
  cluster and selected target. Mark the outcome ambiguous, refresh workspace
  users, and require the operator to review before manually trying again.
- Never automatically retry, parallelize, or reverse a merge.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-satellite-app-ux`,
`$vercel-react-best-practices`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Obtain exact transfer from
`20260711-163000-codex-contacts-database-prod-error.md`, which claims the
Contacts users/database subtree, and from G22 for the Web migration artifacts.
Confirm the RPC remains individually atomic. The Web compatibility route
re-exports this shared handler; keep it `legacy-next` and update its override
note/manifest rather than claiming a Rust implementation.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Route | `bun --cwd packages/users-core vitest run src/routes/users/merge-bulk.test.ts` | authorization, validation, sanitization, and ordered partial-result cases pass |
| Internal API | `bun --cwd packages/internal-api vitest run src/users.test.ts` | bulk-merge helper cases pass |
| Dialog | `bun --cwd apps/contacts vitest run 'src/app/[locale]/[wsId]/users/database/components/duplicate-users-dialog.test.tsx'` | success, partial, and ambiguity cases pass |
| Typechecks | `bun run --cwd packages/users-core type-check && bun run --cwd packages/internal-api type-check && bun run --cwd apps/contacts type-check` | exit 0 |
| Contacts build | `bun run --cwd apps/contacts build` | exit 0 |
| Migration manifest | `bun migration:tanstack:manifest` | Web compatibility route remains tracked as `legacy-next` with current shared-handler note |
| Localization | `bun i18n:sort && bun i18n:key-parity && bun i18n:namespace-check` | all message gates pass if copy changed |
| Repository | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:** the users-core route plus new colocated test for mandatory
response sanitization; the shared `WorkspaceUserMerge` primitive; a typed
bulk-merge helper/test in internal-api; the
duplicate-users dialog and new focused test; English/Vietnamese Contacts copy
only for the retained-failure/ambiguous-result UI; the exact Web route override
and generated manifest entry.

**Out of scope:** changing the merge RPC or schema, parallel execution,
automatic retries, undo, merging more than 100 pairs, redesigning duplicate
detection, or the separate persisted single-merge job.

## Git workflow

Use branch `fix/preserve-partial-bulk-user-merges` and commit
`fix(contacts): retain failed bulk merges`. Use an isolated worktree, run
`bun setup`, claim/release the commit window, and do not push.

## Steps

1. **Characterize the route.** Add `merge-bulk.test.ts` covering unauthenticated,
   nonmember, missing permissions, malformed/oversized/self/foreign pairs,
   all-success, first/middle/last RPC failure, thrown call, and stable input
   ordering. Add the bulk-only discriminated result union above and change only
   `BulkMergeUsersResponse.results` to use it; do not change `MergeResult` or
   `PhasedMergeResult`. Assert calls remain sequential and every
   failure source—Supabase error, unsuccessful RPC payload, and thrown
   exception—logs its internal detail but returns only that stable code. Also
   sanitize workspace-user lookup and outer-catch 500 envelopes. No raw
   database/provider/exception text may reach any JSON response.

   **Verify:** focused route tests pass without changing sequential semantics.

2. **Add the typed client boundary.** Add an internal-api helper for the bulk
   route with exact path, JSON body, and typed response/error behavior. Replace
   the dialog's raw app API fetch with that helper.

   **Verify:** internal-api URL/body/error tests pass and the dialog contains no
   raw `/users/merge/bulk` fetch.

3. **Retain failed work.** Build a stable mapping from each submitted
   `(sourceId,targetId)` pair back to its cluster. On a partial 2xx response,
   remove only successful clusters, retain failed clusters and selections,
   attach the localized generic message for `merge_failed`, invalidate the workspace-user query, and
   stay in review. Treat missing, duplicate, or unknown pair results as
   ambiguous failure and retain the affected cluster.

   **Verify:** dialog tests prove successful clusters disappear, failed ones
   remain selected with their errors, completion is not called, and server
   result order cannot misassociate clusters.

4. **Handle ambiguous transport outcomes.** On request/decoding failure, retain
   all submitted clusters, preserve selections, invalidate/refetch users, and
   show bilingual guidance that completed merges may already have applied and
   the list must be reviewed. Do not initiate another request automatically.

   **Verify:** timeout/network/non-2xx/malformed-response tests assert no cluster
   clearing, no automatic retry, and no completion callback.

5. **Refresh migration ownership and run all gates.** Add/refresh the exact
   override for the Web compatibility route as `legacy-next`, noting that the
   shared users-core response is sanitized and that no Rust mutation exists;
   regenerate the manifest. Run typechecks, localization commands, Contacts
   build, `bun check`, and whitespace verification.

## Done criteria

- [ ] The route's sequential partial-result contract has focused coverage.
- [ ] Every failure source returns only `errorCode: 'merge_failed'`; raw
      internal text is server-log-only and never rendered.
- [ ] The single/phased `MergeResult.error` contract and its consumers remain
      unchanged.
- [ ] The dialog uses the typed internal API and removes only confirmed
      successful pairs.
- [ ] Failed and ambiguous pairs remain reviewable with targets intact.
- [ ] No bulk request is automatically retried or parallelized.
- [ ] Focused tests, typechecks, build, repository, localization (if changed),
      and whitespace gates pass.

## STOP conditions

Stop on missing Contacts or G22 ownership transfer, inability to map a returned pair uniquely
to one cluster, evidence that the RPC itself is not atomic per pair, need for a
schema/idempotency migration, unsupported public response-shape drift, or a
gate failing twice.

## Maintenance notes

This plan improves reviewability but does not claim exactly-once delivery over
an interrupted HTTP request. A later durable merge-job design must solve that
separately before automated retries are safe.
