# Devbox Ops Checklist

Load this checklist when registering, testing, observing, upgrading, or cleaning
up Tuturuuu devbox runners.

## Config And Target

- `TUTURUUU_CONFIG` is the SDK config override. Do not use
  `TUTURUUU_CLI_CONFIG`.
- `bun ttr ...` runs the repo-local SDK CLI.
- `ttr ...` runs the installed CLI.
- Use `ttr whoami --no-update-check` or equivalent config inspection before
  assuming a command targets local, staging, or production.
- For local app validation, make sure `apps/web` is running against local
  Supabase env and that the CLI config base URL points at that app.

## Temporary Runner Smoke

Use a unique, disposable runner name:

```bash
umask 077
ttr box agent register --name "<name>" --json --no-update-check > /tmp/ttr-devbox-runner.json
```

Queue a command:

```bash
RUNNER_ID="$(jq -r '.runner.id' /tmp/ttr-devbox-runner.json)"
ttr box run --runner "$RUNNER_ID" --timeout 90 --json --no-update-check -- bun --version
```

Claim it from the same machine:

```bash
RUNNER_TOKEN="$(jq -r '.token' /tmp/ttr-devbox-runner.json)"
TUTURUUU_DEVBOX_RUNNER_TOKEN="$RUNNER_TOKEN" ttr box agent start --once --no-update-check
```

Expected result:

- `ttr box run` exits `0`.
- Run JSON has `status: "succeeded"` and `exitCode: 0`.
- Logs include `remote$ ...` and command output.
- Runner heartbeat has capability telemetry after the agent starts.

## Useful Smoke Commands

- `bun --version`
- `node --version`
- `git rev-parse --show-toplevel`
- `bun --cwd packages/devbox test`
- A focused package test for the touched code
- `bun check` after focused tests pass, when the repo rules require it

## Build, Serve, Tunnel, And Database Forwarding

Use wrapper commands when the intent is common and long-running:

```bash
ttr box build --cwd apps/web
ttr box serve --cwd apps/web --port 7803
ttr box serve --database-url-env DEVBOX_DATABASE_URL
```

`ttr box build`, `ttr box serve`, and `ttr box tunnel` should not set remote
command timeouts unless the operator passes `--timeout`.

Use Cloudflare tunnels only through local env var indirection:

```bash
export CLOUDFLARED_TOKEN=<token-from-cloudflare>
ttr box serve --cloudflared --cloudflared-token-env CLOUDFLARED_TOKEN
ttr box tunnel --cloudflared-token-env CLOUDFLARED_TOKEN
```

Do not paste raw tunnel tokens into `cloudflared --token ...`, docs, tests, or
handoffs. The CLI should queue a command that references `$CLOUDFLARED_TOKEN`
and passes the raw value only through the run env.

For split-resource workflows, host Supabase or another database on one devbox,
export its reachable connection string locally as `DEVBOX_DATABASE_URL`, and
queue the app devbox with `--database-url-env DEVBOX_DATABASE_URL`.

## Cleanup

Delete token rows before marking the runner revoked:

```sql
delete from private.devbox_runner_tokens
where runner_id = '<runner-id>';

update private.devbox_runners
set status = 'revoked', updated_at = now()
where id = '<runner-id>';
```

Do not rely only on `revoked_at` unless the deployed token verifier filters it.

## Service Expectations

24/7 runner services should:

- run from the resolved platform checkout directory
- execute `ttr box agent start --no-update-check`
- store tokens in a restricted env file under the CLI config directory
- auto-start on boot
- restart on failure
- use `launchd` on macOS and `systemd` on Linux

## Observability

The infrastructure devbox admin page should show:

- runner status and last heartbeat
- run, lease, event, and cache state
- CLI version
- OS and architecture
- Docker, Git, Bun, and Node versions
- CPU, RAM, load average, and uptime

If telemetry is missing, run the agent once and verify the heartbeat route
accepts and stores capabilities.

If a runner row exists with an active token but no heartbeat after
`ttr box setup --agent --service`, inspect the installed service logs first:
`sudo systemctl status --no-pager --full tuturuuu-devbox-runner.service` and
`sudo journalctl -u tuturuuu-devbox-runner.service -n 80 --no-pager` on Linux,
or the matching launchd log paths on macOS. A missing runner-token error usually
means the service wrapper sourced `devbox-runner.env` without exporting it; the
wrapper must source token files under `set -a` before execing
`ttr box agent start`.

Use `ttr box repair --dir .` after upgrading the CLI to regenerate the wrapper
and system service from the existing token file without registering a new runner
row. Use `ttr box repair --dir . --dry-run` when checking a host remotely before
allowing service-file writes or sudo restart commands.
