# Continuous Improvement Audit Index

Audit snapshot: `68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b` on 2026-08-10.

These are advisor plans, not implementation changes. Before executing any plan,
re-read the nearest `AGENTS.md`, load the named Tuturuuu skills, and compare the
plan's evidence with the current branch. If the relevant code has drifted,
update the plan before editing source.

## Recommended execution order

| Order | Plan | Priority | Effort | Risk | Status | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [Enforce the Devbox container boundary](./020-enforce-devbox-container-boundary.md) | P0 | L | High | TODO | None |
| 2 | [Authorize and meter Teach object generation](./025-authorize-and-meter-teach-object-generation.md) | P0 | M | Medium | TODO | None |
| 3 | [Bind Rewise AI work to the selected workspace](./026-bind-rewise-ai-work-to-selected-workspace.md) | P0 | M | High | TODO | None |
| 4 | [Require Nova role-management authorization](./013-require-nova-role-management-authorization.md) | P0 | S | Low | TODO | None |
| 5 | [Enforce Nova submission authorization and grading integrity](./012-enforce-nova-submission-authorization.md) | P0 | M | Medium | TODO | Plan 013 |
| 6 | [Bind Nova sessions to authorized actors](./014-bind-nova-sessions-to-authorized-actors.md) | P0 | S | Medium | TODO | Plan 013 |
| 7 | [Fail closed on task embedding webhook authentication](./006-fail-closed-task-embedding-webhook.md) | P0 | S | Low | TODO | None |
| 8 | [Restrict short links to HTTP/HTTPS destinations](./015-restrict-short-links-to-http-destinations.md) | P0 | S | Low | TODO | None |
| 9 | [Authorize global IP denylist operations](./017-authorize-global-ip-denylist-mutations.md) | P0 | S | Medium | TODO | None |
| 10 | [Sanitize AI route error envelopes](./027-sanitize-ai-route-error-envelopes.md) | P1 | S | Low | TODO | Plan 025 |
| 11 | [Bound public AI generate input](./028-bound-public-ai-generate-input.md) | P1 | S | Medium | TODO | Plan 027 |
| 12 | [Prevent Discord interaction replays](./029-prevent-discord-interaction-replays.md) | P1 | M | Low | TODO | None |
| 13 | [Claim and batch task deadline reminders](./022-claim-and-batch-task-deadline-reminders.md) | P1 | M | Medium | TODO | None |
| 14 | [Handle asynchronous CLI browser launch failures](./023-handle-cli-browser-launch-errors.md) | P1 | S | Low | TODO | None |
| 15 | [Bound meeting transcription input before AI invocation](./016-bound-meeting-transcription-input.md) | P1 | S | Low | TODO | None |
| 16 | [Discover every repository script test](./004-discover-all-script-tests.md) | P1 | S | Low | TODO | None |
| 17 | [Enforce build-info coverage for deployed Next apps](./011-enforce-build-info-coverage.md) | P1 | S | Low | TODO | Plan 004 |
| 18 | [Evict empty Hive realtime rooms](./024-evict-empty-hive-realtime-rooms.md) | P2 | S | Low | TODO | None |
| 19 | [Correct Learn and Teach ownership documentation](./018-correct-learn-teach-ownership-docs.md) | P2 | S | Low | TODO | None |
| 20 | [Remove Shortener phantom dependencies](./019-remove-shortener-phantom-dependencies.md) | P2 | S | Low | TODO | None |
| 21 | [Enforce SES webhook and inbound object authenticity](./009-enforce-ses-webhook-and-object-authenticity.md) | P0 | M | Medium | BLOCKED | Mail catch-all handoff owns app/docs |
| 22 | [Enroll satellite unit tests in the canonical gate](./010-enroll-satellite-unit-tests-in-canonical-gate.md) | P1 | L | Medium | BLOCKED | Plan 004; active Tasks/Inventory lanes |
| 23 | [Bind dataset API-key operations to their workspace](./001-bind-dataset-api-key-operations-to-workspace.md) | P1 | M | Medium | BLOCKED | G22 role/migration lane owns shared route artifacts |
| 24 | [Prevent role grants to non-members](./002-prevent-role-grants-to-non-members.md) | P1 | L | High | BLOCKED | G22 role/migration lane; then operator decision if orphan count is nonzero |
| 25 | [Use Pay app-session actors across billing APIs](./007-use-pay-app-session-actors.md) | P1 | M | Medium | BLOCKED | Reconcile non-terminal Pay migration handoff |
| 26 | [Pin and verify the Rust backend toolchain](./008-pin-the-rust-backend-toolchain.md) | P1 | S | Low | BLOCKED | Native CI/cache handoff owns Rust workflow |
| 27 | [Complete Rust v1 workspace API-key authentication](./021-complete-rust-v1-api-key-auth.md) | P1 | S | Medium | BLOCKED | Backend migration ownership transfer |
| 28 | [Bound report-selector history queries](./005-bound-report-selector-history.md) | P2 | S | Low | BLOCKED | Daily-report handoff owns report-view tests |
| 29 | [Restore the release lockfile invariant](./003-restore-release-lockfile-invariant.md) | P1 | M | Low | BLOCKED | Active release-lifecycle owner; re-audit after terminal note |

The default is to execute only TODO rows in this order. Plan 002 needs a
deliberately staged database rollout and must not be bundled with unrelated
work after its coordination blocker clears. `BLOCKED` is a
coordination state, not permission to work around the active owner; valid plan
states in this index are `TODO`, `IN PROGRESS`, `BLOCKED`, `DONE`, `REJECTED`,
and `SUPERSEDED`.

Plan 003 must not start while
`tmp/agent-coordination/20260810-090000-codex-release-please-lifecycle.md` remains
`working`; its owner is changing `.github/workflows/release-please-auto-merge.yaml`
and related tests. Re-audit the lockfile invariant after that note reaches a
canonical terminal state, then return the plan to `TODO`, revise it, or reject
it if the active work independently resolves the finding.

Plans 001 and 002 share generated migration artifacts owned by the working G22
lane. Plan 009 overlaps the broad Mail catch-all handoff, Plan 007 overlaps the
Pay migration handoff, Plan 008 overlaps the native CI/cache handoff, and Plan
005 overlaps the daily-report verification handoff. Plan 021 overlaps the
nonterminal backend migration handoffs and must not be used to claim Rust route
ownership or production traffic. Their source findings remain valid, but
execution is not authorized until those notes reach a canonical terminal state
or ownership is explicitly transferred.

## Audit summary

- **Security:** Devbox documentation promises per-lease Docker isolation, but
  the runner executes approved jobs directly on the registered host and its
  top-level denylist still permits general process execution; any root-workspace
  member can enqueue those jobs. Nova allows an ordinary app-session caller to
  mutate global platform role flags; its service-role session/submission routes
  omit object-level authorization, expose hidden test material through a caller
  boolean, and let participants write grading results. Short links accept
  arbitrary URL schemes. The task embedding webhook fails open when its secret
  is absent, then reaches admin and metered-AI operations. Global IP block and
  unblock accepts root membership or an email-domain shortcut without the
  Infrastructure permission boundary. Teach's three legacy AI object handlers
  trust a caller-selected workspace after only cookie authentication and bypass
  AI-credit settlement. Multiple AI routes return stack traces to callers, and
  Discord accepts signed interactions without timestamp freshness or a durable
  interaction-id claim. SES signature
  verification can be disabled in any deployment and the authenticated path
  trusts notification-selected S3 objects. Dataset API-key service-role queries
  omit the workspace predicate; role assignment accepts arbitrary global IDs.
  Mobile also leaves authenticated content visible in the OS app switcher until
  it locks after resume. The external app exposes privileged storage SDK
  handlers behind only the generic proxy guard, but its intended production/demo
  contract must be settled before a high-risk access-boundary change.
- **Correctness:** QR login consumes an approved challenge before session
  issuance succeeds, so a transient issuance error can make the approved login
  unrecoverable; concurrent mobile timer polls amplify the race. Mobile deep
  links also share a single asynchronously overwritten pending slot. CLI browser
  opening reports success before asynchronous process-launch failure, hiding
  the manual login URL. Shared Forms submission limits and multi-table
  persistence are check-then-act and non-transactional; contact merge accepts a
  client-selected destructive resume offset; finance transaction mutations can
  report success after tag failures or delete attachments before a failed row
  deletion. Most Pay APIs use cookie-only actor resolution despite the
  satellite's app-session contract. Polar activation and Square catalog webhook
  side effects can be acknowledged without durable retry. Rewise authorizes the
  route workspace but submits the platform root workspace for chat and files,
  while title/summary work resolves another implicit workspace.
- **Tests:** `bun check` reaches `test:scripts`, but 15 test files under
  `scripts/` are absent from its hand-maintained command. A direct run proved 79
  of 80 cases pass and exposed a stale Hive Docker heap-budget assertion that
  the canonical gate never runs. Eight deployed Next workspaces with at least
  213 unit files declare no Turbo `test` task; direct runs exposed stale Tasks
  tests and Inventory collection/root errors. The full SePay webhook state
  machine and recurring-transaction route handlers have no integrated route
  tests.
- **Performance:** the deadline-reminder cron reads the complete due set and
  performs sequential per-task/per-interval/per-watcher RPCs; its separate
  check, create, and record operations can duplicate notifications under
  overlap. Hive retains every room ID forever and scans them every ten seconds;
  its realtime message/world payloads also have no measured bounds. Storage
  analytics recursively walks the full object tree with serial page requests.
  Meeting transcription buffers unbounded, untyped audio before
  metered AI invocation. The public AI generate endpoint also accepts unbounded
  prompt/system input before provider invocation and full execution persistence.
  Notification batch cron materializes the whole backlog
  and does not verify its conditional claim, enabling duplicate delivery.
  Wallet checkpoint reads can issue roughly wallets-times-checkpoints RPCs, and
  periodic reports expand schedules/groups/members serially. Money Lover import
  and sales export remain unbounded; Inventory sales-period counts are N+1.
- **Architecture/migration:** Two registered Rust v1 workspace handlers use
  unconditional-false API-key verifier stubs even though the crate contains a
  working scrypt implementation; the plan is blocked by active backend
  ownership and does not change live Next.js routing. The backend's 700-line
  source ceiling is not mechanically enforced and 110 Rust files already
  exceed it. Vendored Flutter PCM code lacks clear upstream provenance and its
  license file contains unresolved conflict markers. Rust declares version 1.95
  while local selection is unspecified and CI floats on `stable`. The deploy
  watcher implementation and test have grown to 8,759 and 11,714 lines,
  respectively. Method-level Rust
  ownership remains weaker than the desired executable migration model. Ten
  app-local API-auth engines total roughly 9,700 lines and have already drifted
  in satellite audience policy. Learn/Teach contributor docs still describe the
  pre-cutover Web-owned API architecture despite 70 local v1 handlers. Mind
  carries a 911-line Postgres log-drain fork whose only live context setter is a
  no-op, and Rewise retains a broad stale dependency/date-helper layer.
- **Release observability:** Apps and Tools are deployed Vercel targets but lack
  the fleet's canonical `/api/build-info` exact-SHA endpoint; no registry-derived
  validation prevents future omissions.
- **Docs:** the root mobile README remains Flutter's starter template and does
  not describe this app's setup, generated code, authentication, or validation
  workflow.
- **Release engineering:** the public offline/realtime packages are versioned
  but have no visible publication workflow or support contract. The prior
  21-workspace lockfile mismatch plan is blocked by active overlapping
  release-lifecycle work and must be re-audited, not executed from stale
  assumptions. Four unused Shortener dependencies also create false transitive
  affected-path edges and unrelated deploy selection.

## Direction options

1. **Recommended: complete the Teach-to-Learn parent invitation loop.** The
   database models expiring invitations and Learn promises parent access, but
   there is no acceptance route or parent-link UI. Start with an identity,
   consent, expiry, revoke, and telemetry design spike before implementation.
2. **Turn Hive's research timeline into experiment comparison.** Hive already
   persists model, prompt mode, context, output, tokens, cost, trigger, and
   research-session identity, but comparison is manual JSON export. Define
   reproducibility and evaluator semantics first, then compare named sessions
   side by side on outcomes and cost.
3. **Activate one durable offline mobile workflow.** The mobile app initializes
   an offline queue, but no production dispatcher/enqueue path completes the
   promise. Start with Tasks quick capture: define identity and workspace
   binding, conflict semantics, retry/dead-letter visibility, and a reconnect
   success metric before expanding to other mutations.
4. **Complete CMS live-delivery proof with Yashie.** Use one real external site
   to validate draft/preview/publish, cache invalidation, rollback, and operator
   observability end to end. Treat this as a product contract exercise, not a
   broad CMS rewrite, and coordinate with the active CMS owners.
5. **Turn Mind node links into cross-app alignment.** Mind already stores link
   records, but users cannot attach live Tasks or Calendar objects and see their
   status/date drift on strategy nodes. Start with typed, permission-redacted
   forward links before adding reverse links.
6. **Graduate Rewise into workspace-scoped collective memory.** After Plan 026,
   source governed models and workspace knowledge collections through a
   provider-neutral boundary, then measure cited-answer success and knowledge
   reuse rather than raw chat volume.

The product-direction options are hypotheses, not implementation commitments;
validate them with users and telemetry. Immediate security and CI gaps remain
ahead of all six.

## Considered and deferred

- Fix Discord's initial error responses so ingress returns a real initial
  interaction response instead of PATCHing `@original` before deferral (high
  confidence, S); keep separate from durable replay protection.
- Paginate Forms response tables without fetching the full response-id corpus,
  metadata, and answers on every page; blocked until the active Forms ownership
  handoff terminates (high confidence, M).
- Add destructive-executor tests for Mira and partial-failure tests for Discord
  assign/unassign operations (high confidence, M each; lower leverage than the
  uncovered ingress security boundary).
- Remove Mind's orphaned app-local Postgres log drain and now-unused driver
  after confirming no deployment relies on its runtime DDL or console patching
  (high confidence, S).
- Remove Rewise's proven-unused packages and dead Moment date helper with the
  workspace package manager, then add a focused dependency-usage check (high
  confidence, S; execute after Plan 026 to avoid manifest churn during the fix).
- Make `pyproject.toml` plus `uv.lock` Discord's sole dependency source, deleting
  or deterministically generating the drifting `requirements.txt` (high
  confidence, S).
- Correct Inventory documentation to describe its `/store/*` pages as legacy
  redirects and Storefront as the canonical buyer-facing owner (high confidence,
  S).
- Fix the legacy Calendar auto-schedule path that upserts newly generated event
  ids and then inserts the same scheduled set again; first decide whether to
  retire the Trigger helper in favor of the v1 unified route (high confidence,
  M migration risk).
- Make Meet teardown stop local/screen media tracks and make recording upload
  failures retain a recoverable blob while reconciling server recording state
  (high confidence, M; coordinate with Meet realtime ownership).

- Decide whether `apps/external` is a production satellite or a local SDK demo,
  then either require authenticated tenant/path authorization for all seven
  privileged storage handlers or production-disable them (HIGH security impact,
  M effort, HIGH rollout risk; product/deployment contract required first).
- Make QR login approval consumption and session issuance retry-safe, and
  serialize mobile polling so one approved challenge cannot be consumed without
  returning a usable session (high confidence, L, HIGH auth-boundary risk).
- Cover authenticated mobile UI before entering the OS task switcher, then keep
  the existing inactivity lock on resume; defer until the active mobile lock
  handoff releases its exact boundary files (high confidence, S).
- Serialize mobile deep-link routing or replace the single pending slot with an
  ordered, deduplicated queue so concurrent sources cannot overwrite or clear a
  newer link (high confidence, S).
- Align guest role controls in shared workspace-access UI after
  `tmp/agent-coordination/20260725-180000-member-invite-satellite-auth.md` reaches
  a canonical terminal state; the database/API boundary in Plan 002 remains
  authoritative meanwhile.
- Add integrated route-level tests for the full SePay webhook state machine,
  including token/endpoint resolution, rate limiting, dedupe conflict recovery,
  classification, finance write, tags, and finalization (high confidence, M).
- Bound Money Lover import bytes and rows before full `formData`/`JSON.parse`
  expansion (high confidence, M); separately stream/bound sales export.
- Persist idempotent Polar activation side effects and workspace-deduplicated
  Square catalog-sync jobs before webhook acknowledgement (high confidence,
  L/M, high/medium rollout risk).
- Migrate remaining cookie-only Infrastructure APIs to the existing
  satellite-aware actor helper after Plan 017 establishes the denylist pattern
  (high confidence, M; inventory routes and tests before broad editing).
- Increment inbound Mail thread counters atomically after deduplicated inserts
  so concurrent replies cannot lose unread/message counts (high confidence, M).
- Centralize Pay target-product eligibility so checkout, preview, and change
  reject archived or non-plan products consistently (high confidence on the
  allowlist gap, S effort).
- Bound calendar active-sync and Drive bulk-delete concurrency, with failure and
  cancellation tests (high confidence, M).
- Add measured byte/count/depth limits to Hive realtime CRDT updates and world
  payloads before persistence and broadcast (high confidence on missing bounds,
  M; thresholds require production-like measurement).
- Replace full-tree serial storage-analytics traversal with a bounded or
  provider-native aggregate strategy shared by TypeScript and Rust (high
  confidence, L, MED parity risk).
- Bound Calendar event query ranges/projections and schedulable-task candidate
  retrieval before decryption/filtering/fan-out; measure realistic result sizes
  before choosing caps (high confidence, M).
- Move full Polar catalog reconciliation out of the request path or introduce
  bounded concurrency with idempotent persistence (high confidence, M).
- Atomically claim a bounded notification-batch working set with
  `FOR UPDATE SKIP LOCKED`; require a successful claim before delivery and test
  overlapping workers (high confidence, M).
- Replace wallet-checkpoint per-row balance/interval RPCs with set-based
  functions and constant-query multi-wallet tests after active finance
  ownership clears (high confidence, L).
- Make periodic-report schedule expansion and member processing set-based or
  durably resumable; preserve AI-credit idempotency (high confidence, L, HIGH
  rollout risk).
- Aggregate Inventory sales-period counts in one workspace-scoped query rather
  than one commerce-sales RPC per period (high confidence, M).
- Split the 8,759-line deploy watcher behind characterization tests before any
  state-machine redesign (high maintenance value, L, HIGH regression risk).
- Add authenticated state-transition tests for Rust mobile MFA handlers; the
  current suite proves only OPTIONS/preflight behavior (high confidence, M).
- Add a backend source-size ratchet that blocks newly oversized Rust modules and
  lowers existing exceptions incrementally rather than attempting a 110-file
  rewrite (high confidence, M/L; coordinate with migration owners).
- Establish upstream provenance, reproducible update instructions, and a clean
  license for the vendored Flutter PCM package before materially changing it
  (high confidence, M, MED legal/supply-chain risk).
- Add route tests for recurring-transaction handlers (high confidence, M).
- Add route-level Calendar mutation tests after Plan 010 makes the owning suite
  canonical (high confidence, M).
- Reconcile the missing `packages/internal-api/README.md` declared in package
  metadata and contradictory tRPC migration docs (useful, lower runtime impact).
- Persist method-level Rust route ownership and add it to `bun check:backend`
  (high strategic value, L effort; next architecture plan).
- Require `manage_workspace_members` for invite-link detail GET (high
  confidence, S effort; suitable follow-up after the critical tenant fixes).
- Remove recipient addresses from mail-route logs (high confidence, S effort).
- Make dataset row, cell, and column mutations transactional (high confidence,
  M effort; coordinate with Plan 001's route extraction).
- Atomically reserve response-copy emails and quotas (high confidence, M
  effort).
- Move shared-form acceptance limits, response/answer writes, and session
  finalization into one transactional boundary with concurrency tests (high
  confidence, L, HIGH rollout risk).
- Replace contact merge's caller-selected `startTableIndex` with a persisted,
  actor-bound merge job whose final deletion requires every phase (high
  confidence, L, HIGH rollout risk).
- Make finance transaction/tag replacement transactional and move attachment
  cleanup plus inventory audit into durable idempotent side effects (high
  confidence, M).
- Split oversized `packages/internal-api` modules while retaining stable export
  paths (maintenance value, M effort, lower immediate impact).
- Replace N+1 workspace permission and education module lookups with bulk
  queries (performance value, M effort; requires workload measurement first).
- Repair stale `CONTRIBUTING.md` setup commands and broken security-policy link
  (useful but lower leverage than runtime and gate failures).
- Replace `apps/mobile/README.md`'s Flutter starter text with app-specific setup,
  generated-code, auth, and verification guidance (high confidence, S).
- Extract the roughly 9,700 duplicated lines of API-auth orchestration into a
  shared server-only engine with app-specific adapters and contract matrices
  (high confidence, L effort, HIGH regression risk).
- Correct the retired `/qr` Apps gateway documentation to `/tools/qr`, then add
  a contract test for documented launch examples (high confidence, S effort).
- Decide whether the public `games` and `workflows` packages are supportable
  products; retire them after registry checks or complete exports, tests, docs,
  and publishing (high confidence, S/M effort).
- Resolve Foundapack's status: re-home one validated founder workflow in a
  maintained surface or mark it explicitly historical (product decision).
- Share Learn/Teach's divergent vocabulary projection through `education-core`
  after Plan 018 corrects ownership docs and characterization fixtures capture
  both current readers (high confidence, M).
- Replace the five hand-maintained satellite registries with a capability-aware
  typed manifest, migrating one low-risk projection at a time (high confidence
  on duplication, L effort, MED design uncertainty).
- Define whether the public offline/realtime packages are supported releases,
  then either add provenance-aware publication automation or make them private;
  re-audit after the active release-lifecycle note terminates (high confidence,
  S/M, MED release risk).
- Revisit an outcome-oriented Apps gateway, executable method-level migration
  ownership, and typed Chat work-context links after the higher-leverage product
  loops above; each needs a focused discovery/contract spike before build-out.
- Keep Mira/Crystal/Voice consolidation, OpenAPI-derived internal API, and
  product-complete migration slices as later strategy options; the fresh parent
  and Hive opportunities have stronger unfinished-product evidence this cycle.

## Not audited in depth

- Full browser UX and accessibility parity across satellites.
- Production telemetry, query plans, and real workload distributions.
- Every Supabase RLS policy or historical migration.
- Dependency vulnerability databases and third-party service configuration.
- Live deployment, canonical-host, or release health.
