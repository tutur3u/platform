# Agent quota routing

Read-only quota snapshots and deterministic routing recommendations for local T3 Code, Codex, and Claude Code accounts.

```sh
bun packages/agent-quota/src/cli.ts status
bun packages/agent-quota/src/cli.ts recommend --provider claude --count 3 --json
bun packages/agent-quota/src/cli.ts recommend --provider codex --count 2 --json
```

Set `AGENT_QUOTA_RESERVES` to a JSON object keyed by instance id to configure `minRemainingPercent`, `maxConcurrent`, or `excluded`. Local source directories are allowlisted in `src/collectors/paths.ts`; credential and authentication files are never opened.

Codex usage comes first from `codex app-server`'s `account/rateLimits/read`, with `CODEX_HOME` set to that instance's home directory and a bounded probe timeout. Codex reads its own stored authentication. Session `token_count` rate limits are used only when the app-server has no current snapshot.

Claude usage falls back to structured `rate_limit_event` utilization in local transcripts. Expired windows, resetless events older than their known window, and plain “usage limit reached” text are ignored. The T3 Limits tab's server-memory snapshot is the intended common authority, but is not available through this package's current read-scoped MCP surface; until T3 exposes it, transcript windows show their observation time and remain subject to the stale-data policy. Transcript token totals are estimates and are never converted to percentages without a configured provider budget.
