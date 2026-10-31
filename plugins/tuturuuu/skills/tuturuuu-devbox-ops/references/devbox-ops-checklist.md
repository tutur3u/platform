# Devbox Ops Checklist

Load this checklist when registering, testing, observing, upgrading, or cleaning
up Tuturuuu devbox runners.

## Config And Target

- `TUTURUUU_CONFIG` is the SDK config override. Do not use
  `TUTURUUU_CLI_CONFIG`.
- Devbox agent poll and heartbeat routes are blocked unless the platform web app
  has `TUTURUUU_DEVBOX_AGENT_API_ENABLED=true`.
- `bun ttr ...` delegates to the trusted global `~/.bun/bin/ttr` (>= 0.28.0).
- For local source development, use `TUTURUUU_CONFIG=<private-config> TTR_RESOURCES_HOME=<disposable-resource-home> bun packages/sdk/src/cli/index.ts box ...` from the repo root; keep production CLI config and scheduler state separate.
- `ttr ...` runs the installed CLI.
- Use `ttr whoami --no-update-check` or equivalent config inspection before
  assuming a command targets local, staging, or production.
- For local app validation, make sure `apps/web` is running against local
  Supabase env and that the CLI config base URL points at that app.

## Manual stale-run recovery

For manual stale-run recovery, use the Infrastructure app's
`POST /api/v1/infrastructure/devboxes/runs/reap-stale`. Its browser actor resolves
through `resolveSatelliteRequestActor(request, 'infra')`; do not verify an
Infrastructure app-session token solely with the platform-target CLI verifier.
The root membership and secrets/roles permission gate also applies to CLI access
bearer tokens. Browser mutations require the exact request Origin and reject
cross-site fetch metadata. Only a verified CLI bearer may omit Origin, not an
ambient CLI cookie. Regression coverage is colocated in the reaper's
`access.test.ts`; see the [remote devbox runbook](https://github.com/tutur3u/internal-docs/blob/main/docs-internal/build/development-tools/remote-devboxes.mdx).

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
- `bun validate` after focused tests pass, when the repo rules require it

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

### Trust-tier isolation evidence

`box doctor --isolation --other-user <user>` requires readable ACL evidence for
the credential, home, checkout, checkout `.env*` files and their ancestors. Linux
uses numeric `getfacl` entries with effective masks; macOS uses `ls -le`. Effective
extended grants conservatively fail even for unrelated identities. Missing tools
or malformed ACL output are `unknown` and fail required evidence. Regressions
live in `devbox-isolation-acl.test.ts`.

`repair --execution-mode` does not authorize replacing another service mode;
that guard requires `--force`. Setup normalizes token paths before both the
overwrite guard and registration. Cover these boundaries with
`devbox-repair.test.ts` and `devbox-isolation.test.ts`; confirm refusal occurs
before credential issuance or file changes.

## Claim admission regressions

When changing admission SQL, preserve the final drain-aware claim body and add
only the mode predicate. Judge must reject every reported `trusted` mode even
with a stale or missing timestamp; only trusted-work admission uses freshness. Judge denial precedes the flag check
and applies even with the flag off. Keep the flag off until every run-enabled
runner sends a fresh `TUTURUUU_DEVBOX_EXECUTION_MODE=trusted` report.
The database owns report timestamps on inserts, identical capability updates
and timestamp-only writes, and rejects future values in the freshness helper.
Exercise NULL operator inputs and timestamp forgery in
`apps/database/supabase/tests/devbox-claim-mode-admission.sql`; historical stale
fixtures may disable the stamp trigger only within their rolled-back test.

Claim migrations replace one function: compose changes from the latest definition
rather than moving an older body later. The final stale-run reaper migration
(`20261026145300`) follows mode admission (`20261026145000`), the single-statement
concurrent active-run index (`20261026145100`) and its missing/invalid-index guard
(`20261026145200`). Never wrap the concurrent index file in a transaction. The
reaper must retain trust-pool, drain and mode admission, inserting
only runner-scoped `reap_stale_devbox_runs(p_runner_id, 25)` after the claim lock.
Run every devbox pgTAP suite against the final sequence and prove the 25-row
bound with more than 25 stale rows plus a stale row for another runner.

Reaper lease cleanup runs after the run/event update, locks affected leases in
ID order FOR UPDATE, then checks live siblings in a separate statement with a
fresh READ COMMITTED snapshot. Enqueue takes FOR SHARE and rejects inactive
leases after waiting. Preserve runner-before-lease trigger order. Cover enqueue
winning the lock, reaper winning the lock, and final-sibling cleanup. Terminal
status uses the locked update target's current status, never a candidate copy.
The global sweep is manual until a separately admitted Cloudflare Cron Control
trigger meets the billable-work and durable-stop requirements; do not imply that
an unscheduled endpoint guarantees cleanup for runners that never claim again.

The lease-race SQL fixture is `supabase/fixtures/devbox-reaper-lease-race.sql`.
Run it as the disposable local stack's `supabase_admin`, separately from the
four ordinary devbox pgTAP suites. Loopback trust does not consume a supplied
password, and Supabase's restricted postgres role cannot use dblink_connect_u.
The isolated lifecycle must destroy the database after committed-session tests,
including on failure; do not grant new production privileges to run a fixture.

## Command-line injection triage

General jobs are intentionally arbitrary execution for authenticated root-workspace
members. Trace submission authorization, private-table/RPC access, runner token
verification and Judge/playground routing before classifying a launcher alert.
`shell: false` protects literal argv but does not sandbox an explicit interpreter
or project script. Exact-commit origin reachability proves provenance, not safety.
The launcher rejects malformed executable names and NUL arguments; do not turn
these guardrails into a claimed executable allowlist. Use the SDK process-group,
runner-trust and commit-run tests, and the API runs authorization tests. Separate
source evidence from deployed grants, pool configuration and token custody.
See `tutur3u/internal-docs: docs-internal/build/development-tools/remote-devboxes.mdx`, section
“Trusted command execution boundary”, for the complete boundary and exceptions.
