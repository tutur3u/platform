# docs-internal
Agent, fleet and infrastructure runbooks that are hidden from the docs site (and `llms.txt`) but still readable in this public repository. Keep nothing here that would be unsafe on GitHub: no secrets, hosts, account or pool labels, thresholds or credential locations. The public-safety guard in `scripts/docs-audit.js` scans this folder.

Detail that is too sensitive for a public repository lives in the private repository `tutur3u/internal-docs` (same relative paths). Summaries of what moved there:

| Page (private) | Summary |
| --- | --- |
| `docs-internal/build/devops/cloudflare-cron-control.mdx` | How scheduled jobs are controlled and stopped on Cloudflare. |
| `docs-internal/build/devops/hive-cloudflare-maintenance.mdx` | Approval-gated maintenance steps for the Hive Worker. |
| `docs-internal/build/devops/secrets-and-configuration.mdx` | Where deployment configuration and secrets are placed per delivery surface; public rules are in the Deployment configuration page. |
| `docs-internal/build/devops/vercel-cost-controls.mdx` | Hosting cost structure and the guardrails that keep spend bounded. |
| `docs-internal/build/development-tools/remote-devboxes.mdx` | Running heavy workflows on self-hosted remote runners. |
| `docs-internal/build/development-tools/machine-storage-health.mdx` | Measuring and safely reclaiming disk space on developer machines and runners. |
| `docs-internal/build/development-tools/agent-quota-routing.mdx` | Spreading delegated agent work across accounts using local quota signals. |

Still in this folder: agent operating model and manual, Cloudflare backend ownership policy, fleet balancer, and the Hive migration plan.
