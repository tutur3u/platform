# Security Default

Tuturuuu is open source and a high-value target. Security checks are part of
ordinary delivery, not a separate opt-in program. These rules apply to every
lane; they never replace a more specific owner's runbook.

## Change-triggered checks

| Change | Required before integration |
| --- | --- |
| Any code, dependency, runtime or workflow change | Focused secret scan of the diff, dependency/advisory review of changed manifests and lockfiles, SAST on touched code, and a trust-boundary read of new inputs, outputs and privileges |
| Auth, RLS, tenant isolation, runners, CI, tokens, storage | An **independent** security review by someone other than the author, recorded as a receipt before integration |
| Docs-only, with no executable or configuration change | A secret scan of the diff |

Keep checks focused on the change. Report a broad audit's scope honestly, and
never claim an all-clear from a scan. A scan reports what its rules matched.
It is not proof of absence.

## CI and supply chain

- Never run untrusted fork code, scripts or artifacts with secrets or write
  permissions. Fork pull requests get read-only tokens and no secrets.
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

- **Daily:** an automated audit runs in the repository's CI security workflows
  under `.github/workflows/`, for example `codeql.yml`. Schedules and job
  definitions live in those workflows, which their CI owner maintains.
- **Weekly:** a deeper review runs on the existing control cadence. Do not
  create a new permanent controller or timer for it.

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

- **Release blocking:** confirmed critical and high findings block release.
  Lowering severity or accepting the risk needs the integration owner's
  recorded decision.
- **Negative assertions:** preserve existing negative assertions, for example
  tests that an unauthorized actor is rejected. Never weaken or delete them to
  make a change pass.
- **Public surfaces:** never put raw secrets, tokens, customer data or customer
  logs in public PRs, issues, comments or artifacts. Reference secret names,
  redact payloads, and keep sensitive evidence in private stores.
