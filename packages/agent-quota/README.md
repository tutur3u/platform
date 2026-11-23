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
