---
name: tuturuuu-cli-finance
description: Tuturuuu CLI finance workflow guidance. Use when listing, reading, creating, updating, deleting, debugging, or verifying finance wallets, transactions, categories, budgets, recurring transactions, analytics reads, pagination, explicit-workspace finance access, or SDK finance response normalization through `ttr finance`.
---

# Tuturuuu CLI Finance

## Core Workflow

Use this skill when the task involves `ttr finance` commands or SDK finance
helpers in `packages/sdk/src/platform-finance.ts`.

Inside the Tuturuuu monorepo, use the local script form:

```bash
bun ttr finance wallets --help
```

Outside the monorepo or after global installation, use `ttr ...` directly.
Use `$tuturuuu-cli` for CLI install, auth, session, version, or general SDK work.
Use `$tuturuuu-commit` when the user asks to commit finance CLI changes.

Detailed examples live in
`plugins/tuturuuu/skills/tuturuuu-cli-finance/references/finance-workflows.md`.

## Finance Resources

Finance commands belong under `ttr finance` and should use the SDK user client
surface instead of duplicating route logic in command handlers. Keep CLI parsing,
payload construction, rendering, and authenticated request helpers separated
when the command group grows.

Support full CRUD for finance resources:

- `ttr finance wallets list|get|create|update|delete`
- `ttr finance transactions list|get|create|update|delete`
- `ttr finance categories list|get|create|update|delete`
- `ttr finance budgets list|status|create|update|delete`
- `ttr finance recurring list|upcoming|create|update|delete`

Keep analytics/read helpers alongside transactions when backed by finance APIs:

- `ttr finance transactions export`
- `ttr finance transactions stats`
- `ttr finance transactions category-breakdown`
- `ttr finance transactions spending-trends`

For multi-value finance query params, prefer explicit repeated query params over
comma-joined values when the backing route expects arrays.

## Read Diagnostics

For read-only finance checks, verify the saved session and selected workspace
first, then prefer tiny JSON reads so agents can confirm behavior without dumping
private finance data:

```bash
bun ttr whoami --no-update-check
bun ttr workspaces --json --no-update-check
bun ttr finance wallets list --workspace <workspace-id> --page-size 1 --json --no-update-check
```

If `workspaces` or `tasks` succeed but `finance` returns `Unauthorized`, treat it
as a finance workspace-permission or deployed route-auth issue, not a broken CLI
session. Do not assume the selected `personal` workspace has finance access; retry
with an explicit workspace id from `ttr workspaces --json --no-update-check`
before changing code.

## Response Shapes

Finance list output should be paginated consistently. Prefer `--page` and
`--page-size` for humans, keep `--limit` and `--offset` aliases for scripts, and
render the same `Page X/Y | N total` footer used by task lists whenever the
response includes a count.

Some finance routes return wrapped read payloads, for example
`{ recurringTransactions: [...] }` or `{ upcomingTransactions: [...] }`. Normalize
those wrappers in `packages/sdk/src/platform-finance.ts` so CLI command handlers
can continue to paginate and render arrays without route-specific shape checks.
Cover that contract in `packages/sdk/src/platform.test.ts`.

## Verification

For finance CLI changes, run focused checks first:

```bash
bun --cwd packages/sdk test src/platform.test.ts
bun --cwd packages/sdk test src/cli/finance-pagination.test.ts
bun --cwd packages/sdk type-check
```

When verifying finance reads against live APIs, keep the payload small and
read-only:

```bash
bun ttr finance wallets list --workspace <workspace-id> --page-size 1 --json --no-update-check
bun ttr finance transactions list --workspace <workspace-id> --page-size 1 --json --no-update-check
bun ttr finance categories list --workspace <workspace-id> --page-size 1 --json --no-update-check
bun ttr finance budgets list --workspace <workspace-id> --page-size 1 --json --no-update-check
bun ttr finance recurring list --workspace <workspace-id> --page-size 1 --json --no-update-check
```

Add or run narrower internal-api finance tests when helper routes exist.
