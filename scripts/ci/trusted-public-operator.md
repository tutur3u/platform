# Trusted public CI: attachment held

The two public dispatch workflows run entirely on free GitHub-hosted runners.
`trusted-public-admission.js` checks fresh repository, run, operator, commit,
ancestry and default-branch control records before source checkout. Missing API
permission or malformed evidence causes explicit failure, never a passing skip.
It requires write/maintain/admin permission for both the original dispatch actor
and the rerun actor. No extra token or production secret is supplied to obtain
permission evidence; an inaccessible collaborator API is a denial.

The PR evaluator is a candidate policy with no runner consumer: same repository
ID and name, exact current head, main base, trusted author association AND a
human actor bound by ID/login to fresh collaborator permission evidence. It does
not accept fork source or confer attachment authority. Fork PR CI stays hosted.
Neither evaluator returns authorization to use a runner.

## Enforcement blocker

A workflow `if` or the proposed dedicated label `ttr-trusted-studio` cannot stop
a fork from editing YAML to request the machine directly. Attachment requires
an enforced boundary outside repository checkout. No such boundary is accepted.

The read-only organization runner-groups API returned HTTP 403 with missing org
runner-group/admin permission. Repository metadata identifies a public repository
with default branch main. The 403 establishes neither plan capability nor a
configured workflow restriction. No group or runner was created or modified.

[GitHub runner-group documentation](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access)
contains differing plan statements. The
[REST contract](https://docs.github.com/en/rest/actions/self-hosted-runner-groups)
describes selected workflows, but does not prove this organization can enforce
them. An authorized operator must read back an actual restriction to the selected
immutable workflow SHA and prove denial of other workflows, refs and fork jobs.
A repository-only allowlist is insufficient. No new reusable workflow is needed
while every job remains hosted.

[Job hook documentation](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts)
describes synchronous hooks and failure behavior.
[Runner JobExtension source](https://github.com/actions/runner/blob/main/src/Runner.Worker/JobExtension.cs)
calls PrepareActionsAsync before adding the job-start hook; the hook precedes
container setup and action pre-steps in the pre-job list. This is not proof of an
immutable job identity or a safe complete host admission boundary. Main-branch
source inspection is research, not acceptance of an installed runner version.
Any hook alternative must pin runner source/binary, establish actual ordering
including action preparation, and authenticate the assigned job ID/run/attempt,
repository, workflow path/SHA, actor and current source via trusted channels.
Caller-controlled environment and event files cannot be the root of trust.
No fork action, pre-step, container or checkout code may execute before admission.
Missing evidence must stop the assigned job. Labels are routing metadata only.

## Operator acceptance before enablement

Attachment stays HELD until independent security approval of the exact design PR
and lifecycle acceptance. The registration owner alone may register after those
gates; this source change grants no registration, JIT-token, service, user,
broker, production, dispatch or deployment authority.

Acceptance must include all of the following evidence:

- A non-admin disposable execution identity, ephemeral one-job runner and empty
  dedicated workdir/home; no inherited credentials, shared author caches,
  production secrets or persistent writable runner control files.
- Enforced immutable workflow admission with fresh same-repository source and
  operator checks. Denial tests for direct fork YAML requests, unknown actors,
  moved SHAs, altered policy, missing APIs and forged environment metadata.
- Admission through the canonical resource broker at the real job start,
  respecting priority workloads and its cap. A registration-time headroom check
  is insufficient. No second broker/controller or daemon is introduced here.
- Teardown after success, failure, cancellation, crash and restart; workspace,
  credentials and caches destroyed; no second job accepted by that identity.
  Legacy public supervisors and unaccepted private JIT packages are not proof.
- A durable stop fence and rollback: disable new assignments at the enforced
  boundary, revoke/remove the disposable runner, verify no further job starts,
  destroy its environment and retain hosted CI. Never fall back to a persistent
  public runner or weaken admission because an API fails.

The source SHA/public inputs, immutable control checkout, disjoint test shards,
Meet frontend plus realtime emitted manifest gates, and missing Web/Finance
adapter failures remain authoritative. Production workflows must never receive
this label. The candidate policy cannot substitute compiler output for runtime,
staging or production acceptance.

Run deterministic source tests with:
`node --test --test-concurrency=2 scripts/ci/trusted-public-admission.test.js scripts/ci/public-dispatch.test.js`.
These use synthetic public metadata and execute no fork code. Installed lifecycle,
broker, group enforcement, registration and remote CI are separate acceptance
items; a source test pass proves none of them.
