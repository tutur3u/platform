---
name: tuturuuu-cli
description: "Install, authenticate, troubleshoot, or publish the Tuturuuu CLI and SDK."
---

# Tuturuuu CLI

Use `ttr <group> <action> --help` to discover the requested operation. In the
monorepo, `bun ttr ...` runs the workspace CLI; elsewhere use installed `ttr`.
Scoped help must work without login, saved config, or update-network access.

For requested installation/repair or command-help changes, read Installation
or Scoped Help in `references/cli-workflows.md`; keep bootstrap instructions
there rather than copying executable installers into other guides.

Load the relevant procedure in `references/cli-procedures.md`:

- Login UX: browser/copy-token authentication or workspace selection.
- Keyboard Selection: human pickers or output changes.
- SDK Client Surfaces / Verification: CLI implementation and affected test targets.

Use `references/cli-workflows.md` for auth and SDK client examples. Source ownership:
`packages/sdk/src/cli/` for parsing/session/rendering, `platform*.ts` for user
clients, `packages/internal-api/src/` for shared APIs, and
`apps/web/src/app/api/cli/auth/` for browser exchange. Inspect only the affected
boundary. Update command help and the SDK docs with changed behavior.

Task operations use `$tuturuuu-cli-tasks`; finance operations use
`$tuturuuu-cli-finance`; local validation admission uses `$tuturuuu-cli-resources`.
These operations do not require installation, login, or a CLI code-validation pass
when the existing CLI/session already works.

Use non-TTY/JSON output for automation; never expose stored credentials. Preserve
SDK exports and route authorization. Select focused tests for changed behavior,
then run required repo checks. Release Please owns package versions.
