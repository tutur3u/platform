# Security Default

Tuturuuu is open source and a high-value target. Security checks are part of
ordinary delivery, not a separate opt-in program. These rules apply to every
lane; they never replace a more specific owner's runbook.

This in-repository reference is canonical and self-contained for Tuturuuu.
The user-local shared
[security review and cadence contract](~/.codex/skills/pstack-t3-workflow/references/t3-orchestration.md#security-review-and-cadence)
is a convenience link for installations that provide it; no local skill is
required to apply the rules below.

## Change-triggered checks

| Change | Required before integration |
| --- | --- |
| Any code, dependency, runtime or workflow change | Focused secret scan of the diff, dependency/advisory review of changed manifests and lockfiles, SAST on touched code, and a trust-boundary read of new inputs, outputs and privileges |
| Authentication/authorization, RLS and tenant isolation, credentials and tokens, storage delivery, CI/actions, runner execution, package publishing, deployment | An **independent** security review by someone other than the author, recorded as a receipt before integration |
| Docs-only, with no executable or configuration change | A secret scan of the diff |

Keep checks focused on the change. Report a broad audit's scope honestly, and
never claim an all-clear from a scan. A scan reports what its rules matched.
It is not proof of absence.

## CI and supply chain

- Never run untrusted fork code, scripts or artifacts with secrets or write
  permissions. Fork pull requests get read-only tokens, no secrets, no trusted
  caches and no privileged execution of their install/build scripts.
- Pin third-party actions to a full commit SHA. Pin downloaded artifacts and
  tools to a version plus digest.
- Grant least privilege: default workflow tokens are read-only, and a job
  declares the narrowest permissions it needs.
- Before a privileged follow-up (deploy, release, comment, merge), enforce
  actor trust and head/branch trust. A `workflow_run` or bot completion must
  match the expected repository, branch and head SHA.
- Every privileged mutation fences duplicates, replays and UNKNOWN outcomes.
  An unknown result stops and reconciles rather than retrying blindly.

## Cadence

Both cadences run only through existing admitted mechanisms. Where one is
missing, record the exact gap, its owner and its resume event. Never create a
T3 timer, scheduler or second cadence for it.

| Cadence | Mechanism | Status (2026-10-23) |
| --- | --- | --- |
| Daily automated audit | Existing admitted trusted CI: the scheduled security workflows under `.github/workflows/` | **Gap.** `codeql.yml` runs only on `workflow_dispatch`, and no scheduled security workflow is merged yet. Placeholder: [scheduled security workflows](https://github.com/tutur3u/platform/pulls?q=is%3Apr+label%3Asecurity+schedule) (pending, not yet merged). Owner: the CI security workstream under the project integration owner. Resume event: the scheduled workflow merges; then replace this placeholder with its path. |
| Weekly deeper review | The existing admitted control cadence of the project integration owner | Runs only if that cadence is admitted. Otherwise the gap is recorded with the integration owner as owner, resuming at the next admitted control run. |

The workflows are owned and maintained by their CI owner; this reference only
points at them.

## Findings

Every finding carries:

| Field | Meaning |
| --- | --- |
| `id` | Stable identifier that survives re-scans, for example a rule ID plus location fingerprint |
| `severity` | `critical`, `high`, `medium`, `low` or `info` |
| `owner` | The lane or person accountable for remediation |
| `source` | Scanner/rule, advisory ID, or reviewer receipt |
| `status` | `open`, `confirmed`, `fixed`, `accepted-risk` or `false-positive`, with the evidence for the transition |
| `receipts` | PR, head SHA and the check that proves remediation |

- **Release holds:** open critical and high findings (including unconfirmed
  findings) that affect a proposed release remain explicit holds. A hold is
  removed only through one of these evidenced dispositions:
  - a verified fix, with fresh exact-head evidence and the relevant negative
    control;
  - a false-positive determination with evidence tied to the finding ID and
    affected release scope;
  - an explicit recorded risk acceptance by the authorized release authority,
    naming the finding ID, scope and expiry.
- **Nonwaivable rules:** risk acceptance never waives them.
  - Exposed secrets stay revoked and rotated.
  - Untrusted code gets no privileged credentials.
  - Legal, tenant-isolation and project-mandated gates still apply.
- **Classification:** distinguish confirmed findings from leads and false
  positives. Routine clean scans do not erase historical failures, unknown
  supplier coverage or pending production acceptance.
- **Negative assertions:** preserve existing negative assertions, for example
  tests that an unauthorized actor is rejected. Never weaken or delete them to
  make a change pass.
- **Public surfaces:** never put raw secrets, tokens, customer data or customer
  logs in public PRs, issues, comments or artifacts. Reference secret names,
  redact payloads, and keep sensitive evidence in private stores.
