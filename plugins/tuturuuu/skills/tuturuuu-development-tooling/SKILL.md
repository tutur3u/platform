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
security, ownership, migration parity, and delivery boundaries. Remove generic
encouragement, duplicate recipes, arbitrary approval pauses, and unsupported tool
requirements. Do not turn a model-specific preference into a universal policy.

Audit canonical sources and symlink targets once. Managed plugin caches and runtime
system skills are installer-owned; update their source package when appropriate.
Preserve metadata, licenses, invocation policy, scripts, and useful references.
An audit may leave a file unchanged when it already has the right scope.

- For scripts and CI behavior, consult the relevant section of
  `references/ci-tooling-patterns.md`.
- For shared-checkout ownership, use `$tuturuuu-agent-coordination`.
- For a changed operating workflow, update the relevant `apps/docs` page.
- For plugin edits, keep folder/frontmatter names aligned, retain
  `agents/openai.yaml`, and update `apps/docs/build/development-tools/codex-plugin.mdx`.
  Release Please owns version bumps.

Run `python3 plugins/tuturuuu/scripts/validate_plugin.py` for plugin edits, then
`bun check` when scripts, configuration, or docs pages changed. Validation should
check meaningful structure and behavior, not require longer descriptions or fixed prose.
