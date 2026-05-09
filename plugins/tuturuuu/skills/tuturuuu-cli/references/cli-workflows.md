# Tuturuuu CLI Workflows

## Installation

Use an existing Bun runtime when available. If Bun is missing and autonomous
installation is appropriate, run the platform-specific installer:

```bash
curl -fsSL https://bun.sh/install | bash
```

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Then install the published CLI:

```bash
bun i -g tuturuuu
```

Verify:

```bash
ttr help
ttr --version
ttr tasks --help
```

Inside the Tuturuuu monorepo, use `bun ttr ...` to run the local package script.
After global installation, use `ttr ...` directly.

Upgrade an existing global install with:

```bash
ttr upgrade
```

## Scoped Help

Help is intentionally scoped so humans and agents can ask for the smallest
relevant surface before running a mutation:

```bash
ttr --help
ttr upgrade --help
ttr finance --help
ttr finance wallets --help
ttr finance transactions --help
ttr workspaces --help
ttr tasks --help
ttr tasks create --help
ttr tasks done --help
ttr tasks close --help
ttr tasks update --help
ttr tasks move --help
ttr help tasks create
```

Help commands should not require login, should not read or write the CLI config,
and should not check the npm registry for updates. This keeps `--help` safe in
first-run, CI, and headless environments.

## Common Commands

```bash
ttr login
ttr login --copy
ttr upgrade
ttr -v
ttr whoami
ttr whoami --json
ttr finance wallets
ttr finance transactions --page-size 10
ttr finance budgets status
ttr workspaces
ttr workspaces --json --no-update-check
ttr workspaces use
ttr tasks
ttr tasks --json --no-update-check
ttr tasks use
ttr tasks create "Add Tuturuuu CLI"
ttr tasks done <task-id>
ttr tasks close <task-id>
ttr tasks update <task-id> --json-payload '{"completed":true}'
ttr tasks --compact
ttr tasks --all
ttr tasks --done
ttr tasks --closed
```

`ttr tasks` orders rows by priority and then due date. Human table output should
show compact due labels such as `Today`, `Tomorrow`, or `May 10`.

Use JSON output for agent workflows:

```bash
ttr whoami --json --no-update-check
ttr tasks --json --no-update-check
ttr tasks --compact --json --no-update-check
```

Use human output for interactive work:

```bash
ttr whoami
ttr workspaces use
ttr boards use
ttr lists use
ttr tasks create "Write CLI docs"
```

Omit IDs in a TTY to select with the keyboard:

```bash
ttr workspaces use
ttr boards use
ttr lists use
ttr tasks use
ttr tasks get
ttr tasks move
```

The CLI defaults to the `personal` workspace after login and when no workspace
has been selected.

Interactive picker rows use one-based indexes and tier/status badges before the
name, such as `[FREE] Tuturuuu` or `[PRO] Personal`.

## SDK Client Surfaces

The CLI should call the SDK user-client surfaces in `packages/sdk/src/platform.ts`
and adjacent `platform-*.ts` modules. Keep command handlers focused on parsing,
payload construction, rendering, and config/session concerns. Put authenticated
API details in SDK client helpers or `packages/internal-api/src/*` helpers.

When a new command group becomes substantial, split focused modules under
`packages/sdk/src/cli/` before the command file grows too large. Keep public
exports in `packages/sdk/src/index.ts` aligned with new SDK clients and payload
types.

## Monorepo Behavior

The Tuturuuu monorepo contains a workspace package named `tuturuuu` under
`packages/sdk`. From the repo root, Bun resolves that package name to the local
workspace package. Use `bun ttr ...` for the local script and `ttr ...` for the
globally installed CLI.

## Mutation Examples

When the user asks to add, create, track, or split a Tuturuuu task, use the CLI
as the source of truth. Prefer `ttr` for globally installed workflows and
`bun ttr` inside the monorepo checkout. Do not create markdown TODOs, local
notes, or GitHub issues as substitutes unless the user explicitly asks.

Create a task with the current selected board/list, or prompt for one when a TTY
is available:

```bash
ttr tasks create "Add Tuturuuu CLI"
```

Create directly into a known task list:

```bash
ttr tasks create --list <list-id> --name "Write release notes"
```

Create with explicit board, list, and labels after discovery:

```bash
ttr boards --no-update-check
ttr lists --no-update-check
ttr labels --no-update-check
ttr tasks create "Fix calendar sync cron job" --board <board-id> --list <list-id> --labels <label-id>,<label-id>
```

Split a combined task by creating the replacements first, then closing the
superseded original:

```bash
ttr tasks create "Integrate Valsea demo into Tuturuuu web app" --board <board-id> --list <list-id> --labels <label-ids>
ttr tasks create "Integrate Valsea demo into Tuturuuu mobile app" --board <board-id> --list <list-id> --labels <label-ids>
ttr tasks close <combined-task-key>
```

Mark completed and let Tuturuuu choose the first `done` list:

```bash
ttr tasks done <task-id>
```

Mark completed into a specific done destination:

```bash
ttr tasks done <task-id> --list <done-list-id>
```

Use a raw update payload when the agent needs to combine completion with other
field changes:

```bash
ttr tasks update <task-id> --json-payload '{"completed":true}'
```

Mark closed and let Tuturuuu choose the first `closed` list when available:

```bash
ttr tasks close <task-id>
```

Mark closed into a specific closed destination:

```bash
ttr tasks close <task-id> --list <closed-list-id>
```

Move with a picker, or move directly:

```bash
ttr tasks move
ttr tasks move <task-id> --list <list-id>
ttr tasks move <task-id> --target-board <board-id> --list <list-id>
```

## Finance CRUD Examples

Use `ttr finance` for wallet, transaction, category, budget, and recurring
transaction workflows:

```bash
ttr finance wallets
ttr finance wallets get <wallet-id>
ttr finance wallets create "Cash" --currency VND --balance 0 --type STANDARD
ttr finance wallets update <wallet-id> --name "Operating Cash"
ttr finance wallets delete <wallet-id>
```

```bash
ttr finance transactions --page-size 10
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
