# Plan 250: Single-Source the Post-Email Queue Runtime

> **Executor instructions:** Replace the Web and Infrastructure queue copies
> with one package-owned state machine and thin host adapters. Preserve Web as
> the scheduled production authority, preserve the Infrastructure run-now API,
> and move the substantially reworked Web cron implementation out of the legacy
> route tree.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- apps/web/src/lib/post-email-queue apps/web/src/lib/post-email-queue.ts apps/web/src/components/email/templates/default-email-template.tsx 'apps/web/src/legacy-api-routes/cron/process-post-email-queue' 'apps/web/src/app/api/cron/process-post-email-queue' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/posts/force-send/route.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/approvals/route.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/route.ts' 'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/[postId]/route.ts' apps/infrastructure/src/lib/post-email-queue apps/infrastructure/src/lib/post-email-queue-cron.ts 'apps/infrastructure/src/app/api/v1/infrastructure/post-email-queue' 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/post-email-queue/page.tsx' 'apps/infrastructure/src/app/[locale]/(dashboard)/[wsId]/mail/default-email-template.tsx' packages/users-core/src/lib/post-email-queue packages/users-core/src/lib/post-email-queue.ts packages/users-core/package.json apps/infrastructure/package.json bun.lock apps/tanstack-web/migration/route-manifest.json apps/tanstack-web/migration/route-overrides.json tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the daily-report `handoff` owns both queue
  implementations and their tests, the Mail `handoff` owns `bun.lock`, and the
  active G22 lane owns the generated TanStack route manifest
- **Priority:** P1
- **Effort:** L
- **Risk:** HIGH
- **Category:** architecture / correctness / test coverage
- **Depends on:** exact-path transfer from daily-report, Mail lockfile, and G22
  route-artifact owners
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

Web and Infrastructure each carry a complete, deployable post-email queue
engine. Twelve of fifteen modules are byte-identical, both 1,752-line queue
cores are identical, and the 465-line cron orchestration is identical. The
latest production timeout repair was intentionally applied to both copies,
demonstrating that every safety or performance fix currently requires two
coordinated edits and can leave one operational entry point stale.

## Current state and dedupe evidence

- `apps/web/src/lib/post-email-queue/queue-core.ts` and
  `apps/infrastructure/src/lib/post-email-queue/queue-core.ts` are byte-identical
  1,752-line implementations. Their queue-core tests are also identical.
- Twelve of the fifteen sibling modules are byte-identical. The batch modules
  differ only at the host template import, while Infrastructure locally copies
  status constants that Web already re-exports from `@tuturuuu/users-core`.
- `apps/web/src/legacy-api-routes/cron/process-post-email-queue/route.ts` and
  `apps/infrastructure/src/lib/post-email-queue-cron.ts` are byte-identical
  465-line orchestrators. Web's live cron and Infrastructure's privileged
  run-now route can therefore drift independently.
- The daily-report delivery handoff records the same timeout/RPC repair in both
  queue cores. This is active exact-path ownership, not historical evidence
  that permits a parallel edit.
- `packages/users-core` already owns the shared post/report domain and the
  canonical queue statuses. Web already depends on it; Infrastructure does not.
  The shared engine can remain host-neutral by injecting template rendering,
  blacklist loading, unsubscribe URL creation, and email dispatch.
- This is not Plan 098's cross-app log-drain consolidation, Plan 147's student
  report job, or Plan 172's topic-announcement delivery state machine. No
  indexed/deferred item owns the duplicated post-email queue runtime.

## Exact shared boundary

- Add a flat public facade at
  `packages/users-core/src/lib/post-email-queue.ts`; the existing
  `./lib/*` export exposes it without a new wildcard. Put internal modules under
  `packages/users-core/src/lib/post-email-queue/**`, splitting every authored
  source file to at most 700 lines and targeting about 400. Do not move a
  1,000- or 1,752-line file unchanged into the package.
- The package owns queue table access, eligibility, paging/reconciliation,
  claiming/maintenance, batch selection, status transitions, counters,
  observability calculations, and the cron phase state machine. It must not
  import `@/`, a host component, `withCronLogDrain`, or process-level secrets.
- Export this exact host seam:
  `PostEmailQueueHostAdapter = { preloadBlockedEmails(emails: Array<string |
  null>): Promise<ReadonlyMap<string, boolean>>; createUnsubscribeUrl(email:
  string): string; renderMessage(input: PostEmailRenderInput): Promise<string>;
  sendMessage(input: PostEmailSendInput): Promise<PostEmailSendResult> }`.
  `PostEmailRenderInput` is exactly `{ post: PrefetchedPost; recipient:
  { email: string; username: string; isCompleted: boolean | null; notes: string
  | null }; groupName: string | null; timezone: string | null; unsubscribeUrl:
  string }`. `PostEmailSendInput` is exactly `{ wsId: string;
  senderPlatformUserId: string; postId: string; recipientEmail: string;
  subject: string; html: string; unsubscribeUrl: string }`.
  `PostEmailSendResult` is the closed union
  `{ success: true; auditId: string | null; messageId: string | null } |
  { success: false; kind: 'blocked' | 'rate_limited' | 'provider_failed';
  reason: string | null }`; adapters normalize provider-specific output to it.
- Export `runPostEmailQueueCycle(input: PostEmailQueueCycleInput):
  Promise<PostEmailQueueCycleSuccess>`. Its input is exactly `{ sbAdmin:
  TypedSupabaseClient; adapter: PostEmailQueueHostAdapter; drainLimit: number;
  sendLimit: number; debug: boolean; nowMs: () => number; createRequestId: () =>
  string; log: (level: 'info' | 'warn' | 'error', message: string, data?:
  Record<string, unknown>) => void }`. The success type preserves exactly
  `{ ok: true, requestId, totalDurationMs, diagnostics, reEnqueue,
  reconciliation, claimed, processed, failed, timedOut, results, debug? }` from
  the current route. Expected row-level send failures remain represented in
  `results`; unexpected database/template/adapter failures throw for the host
  wrapper to retain its current HTTP 500 body. The shared function does not
  construct `NextResponse` or read secrets.
- Web and Infrastructure each keep one thin adapter that imports their local
  email template/blacklist/unsubscribe helpers and `@tuturuuu/email-service`.
  Infrastructure gains `@tuturuuu/users-core` with `bun add` from its owning
  workspace. Do not add host-only rendering/email dependencies to users-core.
- Delete both copied module directories after every production importer uses
  the facade. A repository source contract must reject new production files
  under either retired directory and reject host aliases/imports inside the
  package engine.
- Retarget the direct submodule consumers explicitly to
  `@tuturuuu/users-core/lib/post-email-queue`: Web's default email template,
  post force-send route, user approvals route, and both group-check routes;
  Infrastructure's queue GET route, queue dashboard page, run-now route, and
  default email template. The shared facade must export the currently consumed
  date formatting, enqueue-access, address-validation, and observability names
  without compatibility files under either deleted app directory.

## Web route migration contract

- The destination
  `apps/web/src/app/api/cron/process-post-email-queue/route.ts` is currently a
  generated wrapper exporting legacy GET plus generated HEAD. Verify those are
  its only methods, remove the wrapper, `git mv` the legacy implementation and
  colocated test into the first-class destination, then rewrite them as the
  thin Web adapter/route. Preserve HEAD by explicitly using the existing
  `createLegacyHeadHandler(GET)` contract in the first-class route.
- Delete the legacy source so wrapper generation cannot recreate it. Run
  `bun web:api-routes:check`; success means no wrapper is regenerated.
- No source-embedded override exists for this route at the planned base. Do not
  invent one. Regenerate `route-manifest.json`; keep GET `legacy-next` with
  `targetOwner: rust-backend` and the new first-class `sourceFile`. Rust has no
  implementation and is out of scope.
- Preserve the Vercel cron path, `CRON_SECRET`/`VERCEL_CRON_SECRET` behavior,
  query-limit clamping, response bodies/statuses, and `withCronLogDrain` at the
  Web host. Preserve Infrastructure root-admin authorization and run-now body.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$tuturuuu-development-tooling`, `$tuturuuu-ci-docs`, `$tuturuuu-commit`, and
`$using-git-worktrees`. Read root and nearer AGENTS files. Obtain all transfers
named in Status before creating a worktree. Use Bun, not manual manifest edits,
for the Infrastructure dependency. Coordinate the brief commit window before
route-manifest regeneration and lockfile/staging work.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Hash/reachability inventory | `shasum apps/web/src/lib/post-email-queue/*.ts apps/infrastructure/src/lib/post-email-queue/*.ts && rg -n "@/lib/post-email-queue|post-email-queue-cron" apps packages --glob '!plans/**'` | twin hashes and every production/test importer are classified before deletion |
| Shared engine | `bun --cwd packages/users-core vitest run src/lib/post-email-queue` | queue, reconciliation, claim, batch, adapter-failure, and orchestration cases pass once in the canonical package |
| Host routes | `bun --cwd apps/web vitest run src/app/api/cron/process-post-email-queue/route.test.ts src/lib/post-email-queue.test.ts src/lib/post-email-queue.logic.test.ts && bun --cwd apps/infrastructure vitest run 'src/app/api/v1/infrastructure/post-email-queue/run-now/route.test.ts'` | Web GET/HEAD cron and Infrastructure run-now auth/envelope/adapter contracts pass |
| Source contract | `test ! -d apps/web/src/lib/post-email-queue && test ! -d apps/infrastructure/src/lib/post-email-queue && ! rg -n "from ['\"]@/" packages/users-core/src/lib/post-email-queue.ts packages/users-core/src/lib/post-email-queue` | both copy directories are absent and the host-alias search has no output |
| Route ownership | `bun web:api-routes:check && bun migration:tanstack:manifest && git diff --exit-code -- apps/tanstack-web/migration/route-overrides.json` | no legacy wrapper returns; manifest records the first-class source; overrides remain unchanged |
| Types/builds | `bun run --cwd packages/users-core type-check && bun run --cwd apps/web type-check && bun run --cwd apps/infrastructure type-check && bun run --cwd apps/web build && bun run --cwd apps/infrastructure build` | package and both operational hosts compile/build |
| Repository | `bun check && git diff --check` | all canonical gates pass; whitespace output is empty |

## Scope

**In scope:** both copied queue module directories and tests; Web's flat facade
and focused tests; Web's default email template plus post force-send, approvals,
and both group-check route import sites; the Web legacy cron route/test and
generated first-class wrapper destination; Infrastructure's cron helper, queue
GET route, dashboard page, run-now route/test, default email template, and one
thin host adapter; users-core shared facade/modules/tests; users-core manifest
only if an explicit export is proven necessary; Infrastructure manifest and
package-manager lockfile; generated TanStack route manifest. The source-
embedded override file is verification-only because no matching entry exists.

**Out of scope:** queue database schema/RPCs and generated types; changing
delivery eligibility, recipient ordering, retry, claim, maintenance, or status
semantics; changing email content; moving the Infrastructure API; implementing
Rust; log-drain consolidation; cron schedule/secret changes; production deploy;
unrelated report UI/routes.

## Steps

1. Record SHA pairs, every importer, both public host envelopes, and focused
   characterization. Add adapter-failure cases before moving logic.
2. Split the shared state machine into bounded users-core modules. Replace host
   dependencies with the exact adapter and retain one flat package facade.
   Consolidate duplicated tests into package tests while keeping host envelope
   tests at each host.
3. Add users-core to Infrastructure through Bun. Implement thin Web and
   Infrastructure adapters, retarget every explicitly listed direct submodule
   importer to the flat package facade, then rerun the repository inventory and
   delete both copied directories. Add the source-absence/host-alias contract.
4. Verify the generated Web wrapper, replace it with the moved legacy route and
   test, delete the legacy files, and adapt the route to the shared cycle. Keep
   GET plus generated-compatible HEAD behavior and every current
   HTTP/auth/log-drain contract.
5. Regenerate/check Web wrappers and the migration manifest. Assert the absent
   override stays absent and inspect only the expected first-class source
   change in the generated manifest.
6. Run shared/host tests, source-size and absence checks, typechecks, serialized
   Web then Infrastructure builds, repository, lockfile, whitespace, and exact-
   scope gates.

## Done criteria

- [ ] One package-owned queue state machine serves both operational hosts; no
      production queue implementation remains under either app-local copy.
- [ ] All authored shared source files are at most 700 lines and have no host
      alias/template/secret/log-drain dependency.
- [ ] Web remains the scheduled GET authority and Infrastructure run-now keeps
      its authorization and response contract through thin adapters.
- [ ] The Web route is first-class, the legacy file cannot regenerate, the
      manifest points to the new source, and no override is invented.
- [ ] Shared state-machine and both host-envelope suites, dependency/type/build,
      wrapper/manifest, repository, and scope gates pass.

## STOP conditions

Stop on any missing ownership transfer; drift in the daily-report fix; a hidden
production importer; a host-specific queue semantic that cannot fit the adapter
without changing delivery behavior; dependency cycle; non-identical status,
claim, recipient, response, or log-drain semantics; a generated override need;
unrelated lockfile/manifest drift; or any mandatory gate failing twice.

## Maintenance notes

Future queue fixes belong in users-core and its shared tests. Host adapters own
only rendering, blacklist/unsubscribe integration, provider dispatch, request
authentication, and transport envelopes. Do not restore an app-local state
machine to avoid coordinating a package change.
