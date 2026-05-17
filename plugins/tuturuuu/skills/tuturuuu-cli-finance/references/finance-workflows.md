# Tuturuuu CLI Finance Workflows

## CRUD Examples

Use `ttr finance` for wallet, transaction, category, budget, and recurring
transaction workflows:

```bash
ttr finance wallets
ttr finance wallets --page 2 --page-size 10
ttr finance wallets get <wallet-id>
ttr finance wallets create "Cash" --currency VND --balance 0 --type STANDARD
ttr finance wallets update <wallet-id> --name "Operating Cash"
ttr finance wallets delete <wallet-id>
```

```bash
ttr finance transactions --page-size 10
ttr finance transactions --limit 25 --offset 50
ttr finance transactions get <transaction-id>
ttr finance transactions create --amount 150000 --wallet <wallet-id> --taken-at 2026-05-09
ttr finance transactions update <transaction-id> --category <category-id>
ttr finance transactions delete <transaction-id>
ttr finance transactions export --wallets <wallet-id> --start 2026-05-01 --end 2026-05-31
ttr finance transactions stats --start 2026-05-01 --end 2026-05-31
```

```bash
ttr finance categories
ttr finance categories create "Travel" --expense --color blue
ttr finance budgets
ttr finance budgets status
ttr finance budgets create "Marketing" --amount 1000000 --period monthly --start-date 2026-05-01
ttr finance recurring
ttr finance recurring upcoming --days-ahead 30
ttr finance recurring create "Rent" --amount 5000000 --wallet <wallet-id> --frequency monthly --start-date 2026-05-01
```

## Read Verification

When checking whether finance reads work, use small read-only JSON calls with an
explicit workspace id:

```bash
ttr finance wallets list --workspace <workspace-id> --page-size 1 --json --no-update-check
ttr finance transactions list --workspace <workspace-id> --page-size 1 --json --no-update-check
ttr finance categories list --workspace <workspace-id> --page-size 1 --json --no-update-check
ttr finance budgets list --workspace <workspace-id> --page-size 1 --json --no-update-check
ttr finance budgets status --workspace <workspace-id> --json --no-update-check
ttr finance recurring list --workspace <workspace-id> --page-size 1 --json --no-update-check
ttr finance recurring upcoming --workspace <workspace-id> --json --no-update-check
ttr finance transactions stats --workspace <workspace-id> --json --no-update-check
ttr finance transactions category-breakdown --workspace <workspace-id> --json --no-update-check
ttr finance transactions spending-trends --workspace <workspace-id> --json --no-update-check
```

If `ttr workspaces --json --no-update-check` and
`ttr tasks --json --limit 1 --no-update-check` succeed but finance commands
return `Unauthorized`, keep diagnosis scoped to finance permissions or deployed
finance route auth. Retrying with an explicit workspace id from `ttr workspaces`
is the fastest way to separate selected-workspace permission issues from CLI
session issues.

## SDK Response Normalization

When a finance API returns a wrapped payload, keep normalization in the SDK
client rather than in the command handler. For example, recurring routes may
return `{ recurringTransactions: [...] }` and `{ upcomingTransactions: [...] }`;
`packages/sdk/src/platform-finance.ts` should expose arrays so CLI pagination and
rendering stay resource-agnostic.
