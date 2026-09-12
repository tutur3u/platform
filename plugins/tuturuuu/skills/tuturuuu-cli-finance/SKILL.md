---
name: tuturuuu-cli-finance
description: "Read or mutate Tuturuuu finance records through ttr finance."
---

# Tuturuuu CLI Finance

Use `ttr finance` (or `bun ttr finance` in the monorepo) for the requested finance
operation. Confirm session and workspace; use an explicit workspace and small
paginated JSON reads for diagnostics. A finance-only `Unauthorized` response
can be a workspace/route permission problem even when task reads succeed.
Keep financial payloads private and perform only requested mutations.

- Read Diagnostics and live-read examples: `references/finance-procedures.md`.
- CLI/SDK changes: Finance Resources, Response Shapes, and Verification in that
  reference. Keep SDK wrapper normalization and pagination out of command parsing.
- CRUD and analytics examples: `references/finance-workflows.md`.

Use `$tuturuuu-cli` for install/auth or general SDK changes. Live reads do not
require a code test suite. Implementation changes need focused affected tests
and repository-required validation.
