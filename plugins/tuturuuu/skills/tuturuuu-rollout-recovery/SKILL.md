---
name: tuturuuu-rollout-recovery
description: "Diagnose and recover Tuturuuu production rollouts after rollback, mixed app versions, or shared API failures."
---

# Tuturuuu Rollout Recovery

Use this skill for a production rollout incident or recovery assessment. Ordinary
PR merging remains with `$tuturuuu-pr-merge-sync`; release badge changes remain
with `$tuturuuu-web-release`. This skill grants no deployment or data-write authority.

Establish the live deployment graph before selecting a fix. `apps/web` serves the
live API; `apps/backend` is an undeployed migration target. A passing Rust test or
a satellite build does not establish current production API behavior.

Read [recovery evidence](references/recovery-evidence.md) for alias/source audits,
API diagnosis, safe staging, rollback compatibility, and bounded CI retries.
Read the existing [critical rollout runbook](../../../../apps/docs/build/devops/critical-app-rollout.mdx)
when inspecting or using the production staging gate; use its actual workflow and
probe implementation rather than copying a second deployment recipe here.

- Keep canonical aliases, immutable staged URLs, Git refs, and deployment markers
  separate. Preserve the user's rollback until an authorized compatible candidate
  passes the applicable gates; an alias audit is read-only.
- Confirm per-app build identity and ordinary API responses before attributing a
  broken page to missing UI. Record missing evidence as a gap, not success.
- Preserve authentication, MFA, verified IP blocks, and baseline limits. Optional
  download protection must not become a dependency of ordinary GET/HEAD reads.
- Inspect the authorized promotion range, exact-source CI, migration prerequisites,
  and active E2E fixture ownership before publishing or promoting a repair.
  Do not use local builds, manual database pushes, or cancellation races.
- Report the candidate, canonical alias identities, dependency compatibility,
  exact gates, bounded runtime evidence, and remaining business verification.
  Use a dedicated authorized QA account; do not disclose credentials or customer records.

For integration and delivery, return to `$tuturuuu-pr-merge-sync`. For a paused
handoff, preserve the worktree and resource ownership in
`tmp/agent-coordination/`; stop active watchers unless continued watching is requested.
