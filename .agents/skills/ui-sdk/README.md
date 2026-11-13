# Reviewed UI SDK guidance

Source: https://github.com/vercel-labs/ui/tree/d55a1d825fd19d285ef4a3bd4c4ff1622df08373/packages/core/skills/ui-sdk

Pinned upstream SHA: `d55a1d825fd19d285ef4a3bd4c4ff1622df08373`. License: Apache-2.0 (see LICENSE).
**reviewed copy, do not auto-update**.

This is a substantially abridged adaptation of SKILL.md and all seven reference
files. Only behavior and accessibility guidance is retained. It is opt-in and
does not override repository policy or authorize package adoption.

Removed instructions and examples:

- Package installation, package-manager commands and skill installers.
- Remote documentation fetches, CDN scripts/styles and no-bundler setup.
- Compiler, build, test and browser commands; repository tools own execution.
- Mandatory agent readiness, createAgent, registerTools, WebMCP and bridge tests.
- Broad auto-triggering and mandatory preference for SDK controls over existing controls.
- Mandatory render composition, global CSS layers, web.css and styling migration.
- The prohibition on inspecting compiled artifacts.
- Expected-failure markers that leave discovered regressions green.
- Framework-specific scaffolding, executable examples and unrelated app-comment policy.

No upstream git/CI-setting instructions are retained. No upstream AGENTS.md,
CLAUDE.md, internal skills or automation configuration is imported.
