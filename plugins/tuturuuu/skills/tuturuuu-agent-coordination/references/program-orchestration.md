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

## Worker contract

Every new assignment or substantive continuation contains:

- Goal and checkable acceptance, including requested delivery/runtime evidence.
- Exclusive worktree, exact owned/excluded paths, generated-output owner.
- Upstream findings and current SHA; links are context, not proof of receipt.
- Exact focused checks, resource admission, existing frozen gate/log if any.
- Authority for commits/publication and forbidden operations.
- Bounded investigation/time budget, plus report fields: status, head, paths,
  commands/results, causal evidence, PR, remaining blockers and next action.
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
