---
name: tuturuuu-development-tooling
description: "Maintain Tuturuuu agent skills, developer tooling, repository helpers, and validation scripts."
---

# Tuturuuu Development Tooling

Keep workflow changes tied to the requested task or an observed recurring failure.
Put detailed operational knowledge in the narrowest skill reference or existing docs
page. Keep root AGENTS.md for cross-cutting constraints, not a growing incident diary.

For skill changes, make descriptions concise and discriminating. Keep the entrypoint
focused on decisions and route substantial conditional detail to references. Preserve
security, ownership, active runtime policy, and delivery boundaries. Remove generic
encouragement, duplicate recipes, arbitrary approval pauses, and unsupported tool
requirements. Do not turn a model-specific preference into a universal policy.

Audit canonical sources and symlink targets once. Managed plugin caches and runtime
system skills are installer-owned; update their source package when appropriate.
Preserve metadata, licenses, invocation policy, scripts, and useful references.
An audit may leave a file unchanged when it already has the right scope.
For observed coordination delays, apply the [autonomy and workflow-learning contract](../tuturuuu-agent-coordination/references/program-orchestration.md#autonomy-and-asynchronous-waits); use a bounded child audit, fix the responsible mechanism, and verify guidance propagation without delaying urgent delivery.

For prompt/skill maintenance, use `references/agent-guidance-review.md` for
placement decisions and realistic routing checks.

- For GitHub App identity and credential boundaries, read
  `references/bot-identity.md` and the linked owner runbook.
- For scripts and CI behavior, consult the relevant section of
  `references/ci-tooling-patterns.md`; for protected production publication, use
  `references/production-publication-policy.md`.
- For explicit wave-1 production publication holds, use the
  [cutover runbook](../../../../docs-internal/build/devops/wave1-native-cutover.mdx).
- For shared-checkout ownership, use `$tuturuuu-agent-coordination`.
- For a changed operating workflow, update the relevant `apps/docs` page.
- For plugin edits, keep folder/frontmatter names aligned, retain
  `agents/openai.yaml`, and update `apps/docs/build/development-tools/codex-plugin.mdx`.
  Release Please owns version bumps.

For wave-1 native publication profiles, use
`references/wave1-native-publishers.md` alongside the normal CI guidance.

Run `python3 plugins/tuturuuu/scripts/validate_plugin.py` for plugin edits, then
focused non-build tests for changed scripts/configuration. Do not run local
`bun validate`, setup or builds; require applicable exact-commit CI checks/builds.
For recurring coordination failures, prefer the evidence-state checker and
the [program orchestration reference](../tuturuuu-agent-coordination/references/program-orchestration.md) over
another universal prompt rule. Validation should
check meaningful structure and behavior, not require longer descriptions or fixed prose.
