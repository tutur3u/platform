# Agent quota routing

T3 quota snapshots, pacing telemetry, shared-pool routing, and single-shot
safeguards for Codex, Claude Code, Antigravity, Grok, Cursor, and OpenCode. Read
the [routing runbook](https://github.com/tutur3u/internal-docs/blob/main/docs-internal/build/development-tools/agent-quota-routing.mdx)
for JSON contracts, telemetry coverage, limitations and activation gates.

```sh
bun packages/agent-quota/src/cli.ts status --table
bun packages/agent-quota/src/cli.ts status --snapshots-only --json
bun packages/agent-quota/src/cli.ts status --record --table
bun packages/agent-quota/src/cli.ts recommend --task-kind design --table
bun packages/agent-quota/src/cli.ts recommend --task-kind research --provider antigravity --table
bun packages/agent-quota/src/cli.ts recommend --task-kind implementation --non-private --json
bun packages/agent-quota/src/cli.ts admit < approved-admission.json
bun packages/agent-quota/src/cli.ts observe < provider-outcome.json
bun packages/agent-quota/src/cli.ts switch-lease acquire < transition-owner.json
bun packages/agent-quota/src/cli.ts switch-check < fresh-owner-evidence.json
bun packages/agent-quota/src/cli.ts handover-check < accepted-handover-evidence.json
bun packages/agent-quota/src/cli.ts reconcile-children --parent THREAD_ID --timezone Asia/Ho_Chi_Minh
```

The hooks and collectors use only existing non-credential caches
(`~/.t3/caches/<instanceId>.json`) and read-only T3 SQLite projections. They
never read credentials or tokens, and never call provider APIs with secrets.
Admission, observations, optional `--record` snapshots, and transition leases
write only the tool's own host-wide ledger/history under
`~/.t3/caches/agent-quota/`. Accounts remain shared; transitions are leased by
owner thread only. There is no automatic recovery, failover, top-up, credit
purchase, timer, or daemon.

## Pacing & routing config

- **Pacing**: Per-account and per-window pacing computes `remainingPercent`,
  `msToReset` / `hoursToReset`, `glideFloorPercent` (`3% + 4%` per
  hour-to-reset, scaled by window duration), `burnRatePercentPerHour` from recent
  observations (`pacing-history.json` and `import-usage` observations),
  `projectedExhaustionAt` vs reset, `safeToAdmit`, and
  `recommendedMaxConcurrentLanes`.
- **Routing config** ([`routing.config.json`](./routing.config.json), override
  via `AGENT_QUOTA_ROUTING_CONFIG`):
  - Gemini priority order: `gemini-4-hydrogen`, then `gemini-4-neon`, then
    `gemini-3.8-flash`; **never** `gemini-4-argon*`.
  - Claude `*fable*` models require explicit `--allow-fable` approval;
    `--task-kind design` / `--task-kind ui` prefer Claude Opus (`claude-opus-*`).
  - OpenCode requires `--non-private` and allows only `opencode-go/*`
    subscription models; paid `opencode/*` Zen models are marked `never-to-use`.
  - No top-ups or credit purchases (`noTopUps: true`, `noCreditPurchases: true`).

## Single-shot safeguards

`admit`, `observe`, `switch-lease`, `switch-check`, `handover-check`,
`reconcile-children`, `reroute-plan`, `explain`, `dry-run route`, `import-usage`,
`configure`, and positional `admit POOL MODEL` / `block` retain their existing
contracts. Exit codes for positional `admit`: `0` ADMIT, `3` policy
block/contention, `2` malformed/unverifiable state.

## Follow-ups

- Propagate routing-config gates (Argon ban, Fable `--allow-fable` approval,
  OpenCode non-private / paid-Zen ban, and pacing glide floor) into `admit` and
  `gateDecision` in addition to `recommend`.
- Auto-append usage snapshots to `pacing-history.json` during `observe` and
  `import-usage` so burn-rate projections accumulate without explicit `--record`.
- Preserve live `orchestrator_capabilities` option metadata parity when
  `T3_ACP_MCP_NODE` is unavailable and cache discovery is used.

Automations can read one line of fresh remaining percentages for Codex, Claude,
and each Antigravity instance's Gemini and Claude/GPT pools.

```sh
bun packages/agent-quota/src/cli.ts capacity-line
```

Use `status --json` for reset times, source and freshness. A missing or stale
window displays `unknown`. The T3 snapshot and existing usage import supply
instance-bound readings to the same admission gate.

To ingest a complete `/usage` TSV captured from a verified instance, supply its
T3 instance ID and actual capture time. Import only after the export succeeds.

```sh
bun packages/agent-quota/src/cli.ts antigravity-usage-export INSTANCE_ID CAPTURED_AT \
  < instance-usage.tsv > instance-usage.json
bun packages/agent-quota/src/cli.ts import-usage < instance-usage.json
```

The top-level Antigravity CLI defaults to the CLI login. A capture from that
login needs independent proof that it belongs to the named T3 instance. The
export command performs no login, provider query or instance identity check.

On a T3 host, use `refresh-antigravity-account ABSOLUTE_BINARY_PATH` for a
ten-minute refresh from the default CLI. The command reads the authenticated
account from the current CLI log, runs `/usage`, and confirms the new CLI log
reports the same account before writing the private quota cache. Admission and
`capacity-line` attach the cached reading only to instances whose newest ACP
server log reports that account. Matching instances share one admission pool.
The cached reading expires after eleven minutes, and each active window
expires at its provider reset time. This command requires an existing CLI
login and does not run a login command.

During a T3 provider rename, the collector uses the current key's hashed
profile when it has ACP logs. If the new profile has no server logs yet, it
can read the retained old profile from Automations'
`~/.t3/scratch/automations/provider-rename-map.json`. The collector validates
the old and new directory paths against the key hashes and still requires
matching account evidence in the provider logs. The map fallback is one hop
and uses rows for the local hostname or its final hyphen-separated host label.
Set `AGENT_QUOTA_RENAME_HOST` to the map's host label when the hostname differs.
An existing current-profile log without account evidence, an ambiguous current
log, or a redirected profile log directory leaves the account unidentified.
