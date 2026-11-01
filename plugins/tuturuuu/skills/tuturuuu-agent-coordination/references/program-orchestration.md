# Program Orchestration

Use when authorized work spans concurrent owners, multiple PRs or successive
CI/deployment wakes. A small repair stays a small repair; do not create a program
or additional agents just to rerun a command.

## Coordinator responsibility

Own the scope, dependency order, current acceptance criteria, source review,
integration and delivery evidence. Workers own disjoint implementation lanes.
The coordinator may implement a disjoint lane when the available agent budget
makes that practical; program decisions and completed handoffs must still get
attention. Delegation transfers work, not accountability.

At each wake, read the latest checkpoint and current board, verify protected refs,
then reconcile results against current heads before assigning work. Do not use a
scheduled summary as current truth. Preserve the user's latest authorization and
freeze boundaries. A root-owned finite CI cancellation batch stays finite.

Keep one current board under ignored `tmp/agent-coordination/<program>/state.json`,
with the coordinator as its sole writer. Retain append-only decisions/checkpoints
for history, but report current counts from the board. Workers return receipts;
they do not concurrently rewrite it. Keep credentials and private payloads out.

## Operating model and budget

This in-repository reference is canonical for Tuturuuu's operating model and
checker. The user-local shared
[team operating contract](~/.codex/skills/pstack-t3-workflow/references/t3-orchestration.md#team-operating-contract)
is an optional convenience link; the rules below stand on their own.

Run work as a bounded company hierarchy:

| Role | Holder | Owns |
| --- | --- | --- |
| Director | The user or Mastermind | Cross-project priorities, admin custody, user-local shared skills |
| Project integration owner | One orchestrator per project | The only writer of main and release (and other shared refs), the program board, admission and budget reservations, final acceptance |
| Team lead | A delegated child | One disjoint workset, its workers, its receipts |
| Worker | A delegated child | Its own work branch and PR only, on an isolated worktree |
| Reviewer | A child that did not author the change | An independent review receipt |

The ceiling is `agent-allocation: 10` subagents per thread tree, counting every
descendant. It supersedes the older five-child ceiling. Ten is a ceiling, not a
target.

- **Declared allocation:** each project declares its allocation as the lowest
  of:
  - ten;
  - the observed runtime/provider limit when its scope is `per-thread-tree`;
  - resource admission;
  - any explicit lower allocation.

  `observedRuntimeLimit.unit` must be `per-thread-tree` or `per-parent`.
  A tree limit caps the allocation. A per-parent limit caps each parent's live
  direct children, including reserved children, independently of the tree-wide
  allocation and descendant grants. Record the actual observed scope; do not
  relabel an ambiguous session limit without evidence.

  Changing a runtime limit is a separate, user-authorized configuration change.
- **Live agents:** `reserved`, `queued`, `active`, `waiting` (for children) and
  `blocked` agents occupy a slot. Only drained `done` and `retired` agents
  release theirs. The owner reserves capacity before a launch, so
  simultaneous leads cannot oversubscribe the next free slot.
- **Grants:** the owner grants each lead an explicit remaining budget out of
  that allocation. A lead's children, including nested leads with their own
  grants, must fit inside the grant. A nested lead never receives ten new
  slots.
- **Hierarchy depth:** at most three subagent levels below the owner. Only
  leads delegate.
- **Enforcement:** the T3 runtime does not enforce ten, and no live session is
  claimed to support ten. The budget is a contract plus this checker; a local
  checker cannot configure or enforce T3's runtime limit. Declare live
  allocations, including `observedRuntimeLimit: { limit, unit }`, in the
  program's ignored `allocation.json` (shape: [example](agent-allocation.example.json))
  and check it:

  ```bash
  node scripts/ci/check-agent-budget.js tmp/agent-coordination/<program>/allocation.json
  ```

  The checker rejects:
  - more live agents than the allocation, so 11 is rejected;
  - an allocation above AGENTS.md or an observed tree limit, direct children
    above an observed per-parent limit, or a missing/unknown runtime scope;
  - grants that oversubscribe the owner or a lead;
  - unbounded nesting;
  - live orphans under finished leads;
  - a reviewer that is, or descends from, its author;
  - any subagent that claims integration writes.

  With no arguments it checks that AGENTS.md, this reference and the docs page
  declare the same allocation. The docs audit (`node scripts/docs-audit.js`, run by
  the Documentation and SEO contracts workflow) runs it, and the root script test
  suite runs its tests.

  Passing proves only the declared structure. It does not prove what a live
  thread tree actually ran.
- **Resource admission is separate from agent count.** ttr validation lanes,
  disk, CPU and RAM decide how much heavy WIP may run. `validationLanes` and
  `heavyValidation` record that limit, and the checker rejects heavy work
  beyond the lanes.
  - Shrink active WIP when the queue is long or free disk is low.
  - Admit agents only for real ready work. Never spawn busywork to fill slots.
- **Publication:**
  - Isolated workers and leads commit and push only their own verified work
    branch, or open a PR, under the completion contract below.
  - Main, release and other shared refs move only through the project
    integration owner as sole writer.
  - Shared-checkout workers hand patches to that owner rather than racing its
    index.
  - Publish from the worker's own worktree, so the root checkout's index never
    blocks branch publication.
- **Receipts:** leads return compact receipts with PR, full head SHA, tests run
  with results, residual risk, an explicit blocker (or `none`), and the resume
  event. The reviewer must not be the author.
- **Worktree retirement:** once a child's result is on a pushed branch, the
  parent removes that child's worktree. For recovery, keep the pushed branch
  and a receipt rather than the worktree.
- **No new standing machinery:** create no new permanent controller, timer or
  wake, and never revive a retired one. Use native result/PR watches and the
  existing authorized cadence.
- **Security:** follow [the security default](security-default.md).
  Security-sensitive changes need an independent review before integration.

## Worker contract

Every new assignment or substantive continuation contains:

- Goal and checkable acceptance, including requested delivery/runtime evidence.
- Exclusive worktree, exact owned/excluded paths, generated-output owner.
- Upstream findings and current SHA; links are context, not proof of receipt.
- Exact focused checks, resource admission, existing frozen gate/log if any.
- Authority for commits/publication and forbidden operations.
- Bounded investigation/time budget, plus report fields: status, head, paths,
  commands/results, causal evidence, PR, remaining blockers and next action.
- Accessible autonomy/project guidance, latest custody overrides and remaining child budget.
- Applicable standing orders, especially no local builds, preserved dirty files,
  credentials and production boundaries. Relay changes on every continuation.

Routine fixes within that contract proceed without another permission request.
An adjacent ownership conflict needs a lane update; a new irreversible action or
missing authority needs the human. Never ask whether to continue authorized work.

Use the live orchestration catalog for supported provider/model selection. Native
same-provider children and T3 delegated tasks are child work; top-level threads
require a separate user request. Retain task IDs. Each T3 delegated review round
uses a fresh `delegate_task` call with a distinct stable retry key and consolidated
brief; never send a new round to its backing child thread. Respect the actual
concurrency budget; no universal cloud, model-family or nesting requirement.

## Drain results and keep the frontier moving

Finish the current commit/window or other critical section before accepting a
completion. Drain at its end, on a native PR/scheduled wake, and before reporting
back. Classify each owned unit: active, blocked, handoff, merged or delivered.
Review source and causal receipts, reject stale results, then assign the next
independent unit. Do not silently redo missing child work. Reconcile a late result
against the latest branch, ownership and head before using it.

Integrate verified work continuously under the user's merge policy. Independent
changes stay separate; dependent stacks land bottom-up. Recompute dependencies
and heads after integration. Do not wait for every lane to finish before landing
an independently verified unit.

Read liveness through agent/task status, gate logs and remote refs. Resuming an
idle agent starts work: never resume merely to request status. Resume only with a
concrete next assignment. A queued validation is not a pass; never duplicate it
or edit its frozen source. One bounded remote snapshot per wake replaces polling.
Native PR watches and the authorized schedule provide the next wake.

Send scope, priority, collision and safety corrections to an active child with
`t3_thread_send(mode="steer")`, and confirm `delivery: "steered"`; `auto` can queue
behind the running turn. On each wake, list child queues: keep queued text in the
ledger, cancel only proven-redundant items, and steer still-relevant corrections
once. Hold one coalesced correction for a child that is not yet steerable. Follow
the [steering contract](~/.codex/skills/pstack-t3-workflow/references/t3-orchestration.md#steering-active-children).

Completion notifications can be lost. On every substantive wake, audit child
results and persist processed receipts per the shared
[child-result audit](~/.codex/skills/pstack-t3-workflow/references/t3-orchestration.md#audit-child-results-on-every-substantive-wake);
relay it in briefs for children that delegate.

## Autonomy and asynchronous waits

Use [the shared T3 autonomy contract](~/.codex/skills/pstack-t3-workflow/SKILL.md#autonomous-parallel-execution)
when available. Its useful-delegation and inheritance rules apply within the
current task's authority, not as permission to restart retired controllers or
broaden release access. Its ceiling of ten applies through the declared project
allocation and checker above. Give every child the accessible policy,
project instructions, latest custody override and remaining task-tree budget;
relay permitted pinned bytes when paths are unavailable across machines/providers.

Portable fallback: use useful children whenever separable ready work exists,
within the smaller of the remaining granted budget and actual runtime/resource limits.
Assign disjoint paths and keep one integration writer. Drain results and admit
independent real backlog before arming a native PR watch; then end the turn as
required. A queued heavy gate still allows independent reading, diagnosis,
review or docs. Native result/watch events resume authorized delivery. When no
admitted work remains ready, record the exact blocker, owner and resume event.
Do not invent work, poll or stop a watch just to wait for a user reminder.

Route delegation and owner continuation through the shared
[account-balancing guidance](~/.codex/skills/pstack-t3-workflow/references/t3-orchestration.md#account-balancing-and-safe-continuation).
Portable fallback: unknown or stale quota is not headroom; stop admitting work
to an exhausted account, and let its children resume at the reset rather than
replaying them. Switch the owner only at an idle boundary with an empty queue,
because queued runs keep their old account. Account memory is per provider
instance, so carry it across a switch. Automatic failover is not installed.
Every orchestrator thread, including the cross-project supervisor, shares the
[quota and storage coordination contract](~/.codex/skills/pstack-t3-workflow/references/t3-orchestration.md#cross-orchestrator-quota-and-storage-coordination):
Tuturuuu's SDK, quota and resource lanes own the single implementation, with one
transition owner per owner thread and one cleanup lease per host. Missing quota or
host telemetry stays UNKNOWN.
Accounts are shared: several threads may use one account at once, so track
pool usage, reservations and reset rather than locking an account. Serialize
each owner thread's account transitions. If a safe in-thread switch is
impossible, one top-level successor may take over through the
[replacement-thread handover](~/.codex/skills/pstack-t3-workflow/references/t3-orchestration.md#shared-accounts-and-replacement-thread-handover).
Prefer Codex pools for suitable new or disjoint implementation, analysis and
independent review, following the
[capacity-aware provider preference](~/.codex/skills/pstack-t3-workflow/references/t3-orchestration.md#capacity-aware-provider-preference).
Treat relative plan size and reset credit as planning inputs, not measured
headroom. Keep Claude and Antigravity for task fit, parallel capacity and
reviewer independence, and do not migrate healthy running writers.

Give each lane a bounded end-to-end chunk under the shared
[decision rights](~/.codex/skills/pstack-t3-workflow/references/t3-orchestration.md#autonomous-ownership-and-decision-rights),
and record reusable lessons through
[shared learning](~/.codex/skills/pstack-t3-workflow/references/t3-orchestration.md#shared-learning-and-supervisory-support).
Tuturuuu procedures that follow from them:

- Send follow-up scope as a task-bound message (one that returns a task id) or a
  fresh delegated round. A queued follow-up turn without a task id can fail, for
  example on a usage limit, without notifying the parent, so reconcile such turns
  explicitly.
- To move a child that waits only on a usage reset: save and cancel its queued
  old-account runs, confirm the native session is idle and preserve uncommitted
  files, configure the new account, send a task-bound resume with a state
  readback, then confirm the run is running on the new provider. A configured
  account alone is not a resumed child.
- Early merge needs an independent review accept plus an exact-head local or
  admitted-Linux equivalent of every job the change triggers, recorded with
  commands, versions and exit codes, then a head-checked merge. App builds run on
  an admitted Linux host, never this Mac. Database-contract jobs wait for CI unless
  an isolated database daemon is admitted. Never forge or skip a required check.
- Stage toolchains for validation in project-private paths and call them by
  absolute path. Installing under an nvm major alias silently changes the default
  runtime for every shell on the host.
- A failed-jobs-only rerun cannot reuse artifacts that its successful producer
  uploaded in an earlier attempt. `scripts/ci/workflow-failed-rerun-artifacts.test.js`
  requires every workflow that reruns another run to declare its target and mode;
  partial reruns may only target workflows without artifact handoff.

For observed slow admission, repeated handovers or two fixes failing on one
premise, assign a bounded workflow audit at a safe checkpoint. Read actual
actor/lifecycle and gate receipts, identify the causal bottleneck, and return one
supported improvement or no-change disposition. Coalesce existing work; create
no recurring audit schedule. Protect urgent delivery. Put accepted reusable
lessons in the narrowest maintained docs/skill/helper and verify source-to-plugin
propagation; keep exact source and pending commitments in the private owner store.

## Completion and publication

Finished repository work includes an owned, verified commit and a normal push to
main or the appropriate authorized branch without another user prompt. Preserve
explicit publication holds, branch protection and review/release gates; use a
review branch when direct main publication is not admitted. Follow
[$tuturuuu-commit](../../tuturuuu-commit/SKILL.md) for exact staging and checks.
Verify the remote SHA and report commit, push and remaining CI/release status
separately. Children hand accepted changes to the sole integration writer in a
shared checkout; that owner completes publication before closing the task.
Hosted PR CI runs only with the `ready-for-ci` label: add it only when the PR is
ready to merge (reviewed, exact-head local gates green), batch pushes, and treat
a local exact-head pass as green; see the
[runbook](../../../../../apps/docs/build/devops/github-actions-runbook.mdx#label-gated-heavy-pr-ci-ready-for-ci).

If blocked, preserve the exact patch/worktree, owner, checks, blocker and resume
event in the existing ledger. Never hide unfinished work, include foreign/private
files, or retire recovery data just to report a clean tree. Worktree retirement
still requires the existing cleanup authority.

## Evidence ledger

A board unit uses the following shape (use real full SHAs and receipt locators):

```json
{
  "version": 1,
  "units": [{
    "id": "profile-upload",
    "owner": "profile-worker",
    "worktree": ".worktrees/profile-upload",
    "head": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "state": "active",
    "requiredEvidence": ["focused", "exact-ci", "deployment", "runtime"],
    "evidence": []
  }]
}
```

Choose required gates from the requested outcome before work starts. A source-only
unit need not invent deployment gates. For an end-to-end mobile release, include
exact CI, deployment, eligible migration application, store publication and the
requested device/runtime checks. An intentional no-op must be established before
excluding a gate; a skipped job cannot fill a required gate.

Each evidence entry has `kind`, full `head`, `result` (`pending`, `pass`, `fail` or
`skipped`) and a nonempty `receipt` locator. Replace a gate observation when its
run finishes rather than adding conflicting current-head rows. A new head makes
old receipts historical; review equivalence where appropriate and record a new
current-head receipt with its basis instead of silently inheriting a verdict.

```bash
python3 plugins/tuturuuu/scripts/check_program_state.py \
  tmp/agent-coordination/<program>/state.json
```

This read-only helper rejects duplicate units/gates, multiple active writers in
one exact worktree path and false delivered claims. It reports missing or stale
proof. Exit 0 means recorded requirements are complete for merged/delivered units;
1 means requirements remain; 2 means malformed/inconsistent state. It never
contacts GitHub, verifies a receipt's contents or authorizes a merge/deployment.
Use canonical worktree paths; distinct strings are not filesystem isolation proof.
Freshly inspect actual sources, remote runs and artifact/runtime receipts before
recording PASS. A green workflow whose upload/migration job skipped is not delivery.

## Bounded contrastive experiments

When changing harness guidance for an observed task failure, propose a small
candidate, probe baseline and candidate on the same closed cases, then compose a
scoped lesson from their behavioral differences. Use the existing board's optional
`experiments` list; boards without it retain their existing checker output.
This records evidence for review; it does not execute probes, adopt guidance,
change model weights or authorize runtime work.

An experiment has these fields:

| Field | Recorded contract |
| --- | --- |
| `id`, `unit`, `head`, `task` | Unique experiment namespace, existing unit, its current full SHA, and task identity. |
| `controls` | SHA256 content pins named `input`, `context`, `constraints`, `model`, `executor`, `improver`, `judge`, `webAccess`. |
| `variants` | Distinct SHA256 guidance/content pins named `baseline` and `candidate`. |
| `cases` | Closed nonempty list of objects with unique `id`, `kind` from the unit's required evidence, and SHA256 `input` pin. |
| `budget` | Positive integer `limit` and `used` counts of individual probe executions/observations, with `used` ≤ `limit`. Each baseline/candidate pair consumes two units; `used` must match every observation, including failed/unknown executions. |
| `observations` | Exactly one baseline and one candidate observation per declared case. |
| `decision` | `probe`, `reject` or `adopt`; adoption has additional gates below. |

Every observation carries `variant`, `case`, `head`, `task`, `controls`, `content`,
`input`, `kind`, `outcome` and a nonempty behavior `receipt` locator. Head, task,
controls, variant content and case input/kind must match the manifest. Use `pass`
or `fail` for evaluated task behavior, `error` for failed execution/evaluation,
and `unknown` for missing or inconclusive judgment. Report all four outcome
counts separately; errors are unscored, never converted into task failures or
omitted from the census. A compiler observation cannot fill a runtime case.

The constraints pin identifies the unchanged canonical authorization, consent,
sandbox/network, resource, CI and production-policy snapshot. Inspect that
snapshot and the real observations independently: matching digests check recorded
identity, not semantic preservation or actual enforcement. Pin source through the
unit head and fixed input/context content through `controls`. Keep executor,
improver, judge, model configuration/weights identity and web access fixed.

Adoption requires at least one paired `fail` to `pass`, no worsening, no candidate
failures and no unknown/error outcomes. It also requires `comparison` with
nonempty `summary` and `receipt`, `lesson` with nonempty `scope` and `text`, and
`regression` with current `head`, candidate `content`, matching `controls`,
`result: "pass"` and a nonempty `receipt`. The regression receipt is a separately
admitted focused check, not an extra paired probe. A self-report of “better” cannot
replace paired observations. Experiment acceptance never supplies missing unit
CI, artifact, ability, runtime or production evidence.

Create a distinct namespace and rerun the complete fixed cases when budget,
mode, task selection, model or other control pins change; do not splice receipts
from incompatible runs. Use only earlier reviewed evidence when forming a later
candidate. Persist an accepted lesson through the normal reviewed edit of the
narrowest existing reference and docs, retaining its receipt provenance. Do not
write managed memory or automatically change permissions or production policy.

Rerun the offline example and negative controls with:

```bash
python3 -m unittest discover -s plugins/tuturuuu/scripts -p 'test_program_state.py'
```

`experiment_board()` in that suite calls the real checker on a compiler-only
ledger and a ledger that requires missing runtime proof, then records their
behavioral contrast. The fixtures exercise this data contract without network,
model calls or live effects. They demonstrate mechanical receipt validation,
not improved agent quality, benchmark scores or production availability. Receipt
locators remain assertions until their content is independently reviewed.

The method adapts [Harness²'s README](https://github.com/google-research/harness2)
and [experiment guide](https://github.com/google-research/harness2/blob/main/docs/EXPERIMENTS.md),
linked by [Akshay Pachaar's post](https://x.com/akshay_pachaar/status/2111753928031531232).
The upstream eight editable components are not permission to edit every component
here. Keep the canonical T3 workflow and fixed boundaries; do not install or run
upstream's unrestricted-network, sandbox-disabled executor. Public benchmark
rubric access can contaminate comparisons; this fixture is entirely offline.

## Causal failures and scope control

After two failed repairs based on the same assumption, state that assumption and
collect a rerunnable actor/lifecycle census before another patch. Distinguish an
actual assertion failure from setup failure or zero executed tests. A meaningful
regression must fail the original causal behavior, not merely match new prose.
Prefer architecture, types or an actionable validator over another instruction
when an observed recurring mistake can be prevented mechanically.

Bound infrastructure retries and change the plan when the cause persists. Do not
waive assertions, increase timeouts without cause, suppress errors cosmetically,
or restart stalled work blindly. Park unrelated discoveries as owned follow-ups;
fix blockers of the authorized frontier without expanding every worker's scope.

Before handback, account for each child, current PR/head, active frozen gate and
missing delivery proof. Link all worked PRs and stop native watches as required by
T3 handback policy. Keep the explicitly authorized cadence until the requested
predicate is verified, then disable it. Never claim all done from merged counts.

## Research basis and adaptations

Reviewed upstream pstack at commit
`df581122cde17e6e27686b5a448bde23e4ad4318`:
[orchestration](https://github.com/cursor/plugins/blob/df581122cde17e6e27686b5a448bde23e4ad4318/pstack/skills/poteto-mode/playbooks/orchestrate.md),
[correct](https://github.com/cursor/plugins/blob/df581122cde17e6e27686b5a448bde23e4ad4318/pstack/skills/correct/SKILL.md), and
[attack the premise](https://github.com/cursor/plugins/blob/df581122cde17e6e27686b5a448bde23e4ad4318/pstack/skills/principle-attack-the-premise/SKILL.md).
[Lauren Tan's post](https://x.com/poteto/status/2102050467505430555) links a talk about
high-volume production delivery; the post text was recovered, but the full video
was not transcribed or evaluated for this adaptation.

Adopt durable briefs, bounded result drains, exact-head evidence and causal
replanning. Retain Tuturuuu's authorization, resource broker, CI-only builds,
credential handling and production gates. Do not import Cursor-only Task/Graphite
commands, a cloud-first policy, mandatory cross-model review, an absolute ban on
coordinator implementation or third-party scripts. Managed plugin caches remain
installer-owned; this reference ships through the canonical Tuturuuu plugin.

## Quota-aware delegation

Use the existing `packages/agent-quota` router and its
[runbook](https://github.com/tutur3u/internal-docs/blob/main/docs-internal/build/development-tools/agent-quota-routing.mdx)
for provider headroom. Pass the current `orchestrator_capabilities` response via
`--catalog-stdin` when ACP transport is unavailable. Prefer `--snapshots-only`
for cached provider usage plus active T3 reservations without transcript reads.
Availability is not quota: stale or missing usage/reset evidence is UNKNOWN.
Near/exhausted pools drain; never infer recovery from an elapsed reset. Keep
provider instance IDs distinct from display aliases and deduplicate only with
exposed opaque account identity. These read-only recommendations are not atomic
reservation locks; the dispatch owner still coordinates concurrent launches.

The same router now offers opt-in single-shot `admit`, `observe`, thread-scoped
`switch-lease`, read-only `switch-check`, and `handover-check` commands for every
orchestrator on the host. Follow the runbook's JSON contract. A successor handover
preserves source, dirty files, index, jobs, true child parents, questions, watches,
unknown writes and workspace binding.
Accounts are shared; only a thread's transition is leased. Preference is planning
input, never quota. These hooks require owner integration and independent review;
they do not install automatic failover, spend reset credits, or create successors.

For unbound `thread_send` follow-up failures, use read-only `reconcile-children
--parent <threadId>` and preserve original-task versus latest-turn evidence.
Never duplicate an already queued resume. Pass the reported run/failure identity
to `admit` recovery input for idempotent admission; provider-native delivery of
all descendant terminal failures remains a separate T3 integration gap.

Use the read-only `agent-quota reroute-plan --parent THREAD_ID` for reset-only child waits. Preserve queued text and dirty files, cancel old queued selections, require fresh admission and the thread lease, and verify a task-bound running continuation. Configuration alone is not successful resumption.
