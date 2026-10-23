# Agent quota routing

Read-only quota snapshots and deterministic routing recommendations for local T3 Code, Codex, and Claude Code accounts.

```sh
bun packages/agent-quota/src/cli.ts status
bun packages/agent-quota/src/cli.ts recommend --provider claude --count 3 --json
bun packages/agent-quota/src/cli.ts recommend --provider codex --count 2 --json
```

Set `AGENT_QUOTA_RESERVES` to a JSON object keyed by instance id to configure `minRemainingPercent`, `maxConcurrent`, or `excluded`. Local source directories are allowlisted in `src/collectors/paths.ts`; credential and authentication files are never opened. Provider-reported percentages are authoritative. Transcript token totals are estimates and are never converted to percentages without a configured provider budget.
