---
name: tuturuuu-devbox-ops
description: Tuturuuu remote devbox operations guidance. Use when setting up, registering, testing, upgrading, observing, revoking, or debugging `ttr box` self-hosted runners, runner tokens, boot services, local/production smoke tests, or infrastructure devbox admin pages.
---

# Tuturuuu Devbox Ops

## Core Workflow

Use this skill for operational work around Tuturuuu devboxes: `ttr box setup`,
runner registration, one-shot agents, 24/7 services, smoke tests, upgrades, and
admin observability.

Start by identifying the target:

- Local app/local Supabase: use the repo-local CLI with
  `TUTURUUU_CONFIG=<config-file> bun ttr ...`.
- Installed CLI/global profile: use `ttr ...`.
- Production or another environment: verify the base URL and never assume the
  local config file is active.

Read `references/devbox-ops-checklist.md` for the concrete queue-and-claim
smoke flow, cleanup SQL shape, service setup expectations, and common gotchas.

## Safety Rules

- Never print, commit, or paste runner tokens. Refer to token files or env vars
  by path/name only.
- Prefer `--json --no-update-check` for machine-readable runs.
- Use temporary runner names for smoke tests and clean them up before handoff.
- Cleanup must delete runner token rows and then mark the runner revoked.
- Treat same-machine runner execution as brokered execution validation, not
  proof of container isolation.
- If a devbox failure only appears under the agent, inspect cwd, env isolation,
  shell startup files, config path, and runner token source before dismissing it
  as a flaky test.

## Setup Guidance

For a long-lived machine, prefer:

```bash
ttr box setup --dir . --agent --service --runner-name "$(hostname)-devbox" --yes
```

For current-checkout validation, prefer a one-shot agent loop:

1. Register a temporary runner.
2. Queue one command with `ttr box run --runner <runner-id> ... -- <command>`.
3. Start `ttr box agent start --once`.
4. Verify run JSON has `status: "succeeded"` and `exitCode: 0`.
5. Cleanup token rows and mark the runner revoked.

Use `ttr box upgrade --runner <runner-id>` only when the operator wants to
mutate the installed CLI on that runner.

Use `ttr box serve` or `ttr box tunnel` for long-running preview work. Pass
Cloudflare tunnel tokens by local environment variable name with
`--cloudflared-token-env`; never paste raw tunnel tokens into commands or docs.
Use `--database-url-env` when an app devbox should connect to a database hosted
by another devbox.

## Handoff

Report run IDs, command names, statuses, and exit codes. Do not include raw
tokens or secret-bearing env output. If cleanup depends on production database
access the current agent does not have, provide exact SQL with runner IDs and
state clearly that the token remains active until applied.
