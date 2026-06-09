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
ttr workspaces --help
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
ttr box setup
ttr workspaces
ttr workspaces --json --no-update-check
ttr workspaces use
```

Use JSON output for agent workflows:

```bash
ttr whoami --json --no-update-check
ttr workspaces --json --no-update-check
```

Use human output for interactive work:

```bash
ttr whoami
ttr workspaces use
```

Omit IDs in a TTY to select with the keyboard:

```bash
ttr workspaces use
```

The CLI defaults to the `personal` workspace after login and when no workspace
has been selected.

Interactive picker rows use one-based indexes and tier/status badges before the
name, such as `[FREE] Tuturuuu` or `[PRO] Personal`.

## Devbox Bootstrap

Use `ttr box setup` before offloading heavy workflows to a self-hosted devbox
runner. The command first checks whether the current directory is a valid
Tuturuuu platform checkout. If it is not, interactive setup can clone into a
nested `tuturuuu` directory, while non-interactive setup should pass
`--clone-into <path>` explicitly. It runs `bun install --frozen-lockfile`,
starts local Supabase with `bun sb:start`, reads `supabase status -o json`, and
writes redacted local Supabase connection values into ignored
`apps/*/.env.local` files.

```bash
ttr box doctor
ttr box setup
ttr box setup --dir .
ttr box setup --dir . --clone-into ./tuturuuu
ttr box setup --dir ~/Documents/tuturuuu
ttr box setup --agent --service --runner-name "$(hostname)-devbox" --yes
ttr box upgrade --runner <runner-id>
```

`ttr box doctor` is read-only. Use `ttr box setup --yes` only when the host
should install detected missing prerequisites through its package manager.
Runner registration and boot-starting system service installation require
explicit `--agent`/`--service` flags or interactive confirmation after setup.
Runner heartbeats update the Infrastructure > Devboxes control surface with
CLI/runtime versions, Docker/Git versions, OS, CPU, RAM, load average, and
uptime. Use `ttr box upgrade --runner <runner-id>` to queue `bun i -g tuturuuu`
on a specific runner through the same brokered run path.

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

## Companion Workflows

Use focused CLI skills for command families:

- `$tuturuuu-cli-tasks` for `ttr tasks`, task board/list/label discovery, task
  capture, compact task output, completion, closure, movement, and task
  verification.
- `$tuturuuu-cli-finance` for `ttr finance`, wallet/transaction/category/budget
  and recurring CRUD, analytics reads, pagination, explicit-workspace finance
  diagnostics, and finance SDK response normalization.
