# Agent quota routing

T3 quota snapshots, shared-pool routing and single-shot safeguards for Codex,
Claude and Antigravity. Read the [routing runbook](https://github.com/tutur3u/internal-docs/blob/main/docs-internal/build/development-tools/agent-quota-routing.mdx)
for JSON contracts, telemetry coverage, limitations and activation gates.

```sh
bun packages/agent-quota/src/cli.ts status --snapshots-only --json
bun packages/agent-quota/src/cli.ts recommend --provider antigravity --snapshots-only --json
bun packages/agent-quota/src/cli.ts admit < approved-admission.json
bun packages/agent-quota/src/cli.ts observe < provider-outcome.json
bun packages/agent-quota/src/cli.ts switch-lease acquire < transition-owner.json
bun packages/agent-quota/src/cli.ts switch-check < fresh-owner-evidence.json
bun packages/agent-quota/src/cli.ts handover-check < accepted-handover-evidence.json
bun packages/agent-quota/src/cli.ts reconcile-children --parent THREAD_ID --timezone Asia/Ho_Chi_Minh
```

The hooks use only existing non-credential caches and read-only T3 projections.
Admission, observations and transition leases write the tool's own host-wide
ledger. Accounts remain shared; transitions are leased by owner thread only.
`switch-check`, `handover-check` and `reconcile-children` never mutate threads.
There is no automatic recovery, failover, reset-credit spending, timer or daemon.

The older `status`/`recommend` commands retain optional transcript/app-server
collection; use `--snapshots-only` to exclude it. Stale or missing quota never
becomes measured headroom. Only `admit` supports explicitly bounded UNKNOWN
admission. Preference weights reflect user planning, not telemetry.

`reroute-plan --parent THREAD_ID` reads admission JSON plus per-thread `rerouteEvidence` from stdin. It simulates admission without writing, lists queue cancellation and safe continuation operations, and distinguishes configured from resumed-on-provider. See the routing docs for the evidence schema and native reset-continuation gap.

Admission scans terminal provider-limit receipts before selection. Only model-covering windows count as headroom; Antigravity third-party buckets do not cover Gemini. No-reset usage-limit receipts expire after seven days unless a fresh covering window clears them. Reservations without active native bindings expire after 30 minutes, with 30-day replay tombstones. Contention waits up to two seconds and returns retryable exit 3. See the runbook for receipt clearance and process-verified lease recovery.

Orchestrator-invoked enforcement:

```sh
bun packages/agent-quota/src/cli.ts admit antigravity gemini-4-argon-high
# Exit 0: ADMIT; exit 3: policy block/retryable contention; exit 2: malformed or unverifiable state.
bun packages/agent-quota/src/cli.ts admit codex gpt-6.1-sol --reserve-owner
bun packages/agent-quota/src/cli.ts block --pool antigravity --model-scope 'gemini-4-argon-*' --reason 'Usage Limit Reached resets in 6 days, 23 hours' --evidence 'thread/run/terminal-receipt'
```

The gate reads `~/.local/share/tuturuuu/orchestration/quota/blocks.json` and
cached signals; it never probes. `--reserve-owner` requires fresh headroom above
30%; alternatively set `AGENT_QUOTA_OWNER_POOL` so matching aliases receive the
same protection. This positional command is a preflight; use JSON `admit` for
transactional task reservations and full task requirements. No native callback
is installed: the orchestrator must invoke the gate before `delegate_task` and
record provider failures with `block`.

Usage parity and r2 corrections: `status`, `explain --pool ID --model MODEL`, and
`dry-run route --model MODEL` are cache-only and read-only. `import-usage` accepts
narrow supported usage/home-path exports or typed manual observations on stdin;
`configure` validates per-pool reserve, near threshold, hysteresis, pacing,
concurrency and preference and records a receipt without changing the writer.
Positional `admit POOL MODEL` returns 0 admitted, 3 blocked, 2 malformed or
unverifiable. Global usage-limit receipts cross orchestrator trees and preserve
model-window scope. See the owning docs page for the dated five-account
comparison, exact JSON schemas, supported source and native API boundary.
