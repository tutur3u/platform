# Validation Offload Playbook

Load this playbook when planning or triaging validation runs through internal
devboxes.

## Before Queueing

- Confirm which checkout and config the runner will use.
- Prefer the repo-local CLI for unreleased SDK changes: `bun ttr ...`.
- Use the installed CLI when testing the user's real installed workflow.
- Prefer `--json --no-update-check` for machine-readable client commands.
- Keep stdout clean enough that run JSON can be parsed.
- Avoid passing broad ambient env. Use explicit `--env` or `--env-file` only for
  values the job truly needs.

## Command Boundaries

Good first runs:

```bash
ttr box run --runner <runner-id> --timeout 90 --json --no-update-check -- bun --version
ttr box run --runner <runner-id> --timeout 90 --json --no-update-check -- git rev-parse --show-toplevel
```

Focused validation:

```bash
ttr box run --runner <runner-id> --timeout 180 --json --no-update-check -- bun --cwd packages/sdk test src/cli/devbox.test.ts
```

Broad validation:

```bash
ttr box run --runner <runner-id> --timeout 600 --json --no-update-check -- bun check
```

Use longer timeouts for Docker, Supabase, or Playwright workflows. Keep each run
small enough that a failure names a surface.

Long-running preview validation:

```bash
ttr box serve --cwd apps/web --port 7803 --database-url-env DEVBOX_DATABASE_URL
ttr box logs <run-id>
ttr box preview --lease <lease-id> --port 7803
```

For split-resource validation, put the database on one devbox, export its
reachable URL locally as `DEVBOX_DATABASE_URL`, and pass that into the app
devbox with `--database-url-env`. For public previews, keep Cloudflare tunnel
tokens in a local env var and use `--cloudflared-token-env` so raw tokens never
appear in commands, logs, docs, or handoffs.

## Queue And Claim

For one-shot same-machine validation:

1. Start the `ttr box run ...` command in one session.
2. Start `ttr box agent start --once --no-update-check` in another session with
   the runner token.
3. Wait for both the agent and run client to exit.
4. Confirm the run row or JSON status.

For 24/7 runners, queue the run and monitor with `ttr box list` or the
infrastructure devbox admin page.

## Triage Matrix

- Native fails and devbox fails: fix the code or tests.
- Native passes and devbox fails: inspect runner env, cwd, config, shell startup
  files, missing services, or version drift.
- Devbox passes and native fails: inspect local state, stale services, or
  developer-machine env.
- Run never claims: verify runner status, token validity, lease runner ID, and
  agent heartbeat.
- JSON points to the wrong environment: verify `TUTURUUU_CONFIG`, base URL, and
  whether `bun ttr` or global `ttr` was used.

## Reporting

Capture:

- command
- run ID
- runner ID when safe
- status and exit code
- one or two key log lines
- whether the runner was same-machine, remote-machine, or container-isolated
- cleanup status for any temporary token
