---
name: tuturuuu-development-tooling
description: Tuturuuu development tooling and shared-learning guidance. Use when improving Codex skills, plugin behavior, repo automation, validation scripts, docs runbooks, developer experience, agent workflows, or recurring learnings that should benefit future Tuturuuu contributors and assistants.
---

# Tuturuuu Development Tooling

## Core Workflow

Use this skill when a task changes how agents, assistants, or contributors build,
verify, debug, operate, or learn from the Tuturuuu platform.

Every development-tooling change should ask:

- Can this reduce repeated manual setup for future sessions?
- Can this become a plugin skill, reference checklist, script, or docs runbook?
- Can this be validated automatically in CI or a focused local script?
- Did the session reveal a durable gotcha worth preserving for future agents?
- Could another agent be editing the same worktree, and does the coordination
  protocol need a note or update?

Read `references/ci-tooling-patterns.md` when the work changes root scripts,
formatting behavior, repo checks, CI validation, or plugin maintenance rules
that used to live in the root operating manual.

## Incremental Improvement Standard

When touching Tuturuuu tooling, make the smallest useful improvement that helps
future work. Examples:

- add a focused validation command after discovering a repeated failure mode
- update a plugin skill when a new workflow becomes standard
- document CLI, deploy, database, mobile, or CI behavior in `apps/docs`
- add a helper script when an install or verification flow is easy to automate
- refine prompts, checklists, or skill descriptions so future triggering is more reliable
- route shared-worktree ownership and handoff behavior through
  `$tuturuuu-agent-coordination`
- extract repeated commit behavior into `$tuturuuu-commit` instead of relying on
  memory or final-response habits

Do not expand scope into broad refactors. Keep improvements tied to evidence from
the current task or recent local failures.

## Plugin And Skill Changes

For `plugins/tuturuuu` changes:

- keep `.codex-plugin/plugin.json` present and aligned with the folder name
- keep every skill folder aligned with its `SKILL.md` frontmatter `name`
- include `agents/openai.yaml` for every skill
- keep default prompts short, natural, and action-oriented
- keep skill text portable across machines
- put detailed operational material in `references/`
- update `apps/docs/build/development-tools/codex-plugin.mdx`
- run `python3 plugins/tuturuuu/scripts/validate_plugin.py`

When a plugin change is committed, use `$tuturuuu-commit` so skill, manifest,
validator, and docs updates are staged together only when they describe one
coherent plugin behavior.

When improving agent task-capture behavior, make `ttr` the default path for new
Tuturuuu tasks. Update `AGENTS.md`, `$tuturuuu-cli`, and plugin docs together so
future assistants create, label, split, and verify tasks through the CLI instead
of drifting into local notes or issue trackers.

## Coordination Changes

Use `$tuturuuu-agent-coordination` when the task is about shared worktree
ownership, dirty-path handling, active coordination notes, archived context,
overlap resolution, handoff behavior, or staged-path safety. When changing that
protocol, keep `AGENTS.md`, `apps/docs/overview/agent-operating-manual.mdx`, the
Codex plugin docs, the platform checklist, and the dedicated coordination skill
aligned.

## Documentation Follow-Through

If a workflow, install step, debugging path, release process, or validation
pattern changed, update `apps/docs` in the same session. Prefer updating an
existing page over creating a new page.

When the improvement is only relevant to agent behavior, update the Tuturuuu
plugin skill or reference page as the durable source.

## Verification

Run the focused validation for changed tooling first, then the repo-required
checks for touched file types. For plugin changes, the focused validation is:

```bash
python3 plugins/tuturuuu/scripts/validate_plugin.py
```

If TypeScript, JavaScript, package metadata, workflow config, or docs pages are
touched, finish with `bun check`.
