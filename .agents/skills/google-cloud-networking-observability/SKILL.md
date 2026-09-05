---
name: google-cloud-networking-observability
description: "Diagnose Google Cloud network connectivity, latency, and traffic using logs and metrics."
---

# Google Cloud Network Investigation

Identify the requested resource, project, time window, and question before querying.
Use the most direct available source and present useful findings promptly. Continue
until the question is answered or the diagnosis reaches a concrete access/scope boundary.
Zero results may reflect inactivity, filters, missing telemetry, or sampling; verify
which interpretation is supported before declaring there was no traffic.

Choose sources by the question: firewall logs for matched allow/deny rules, NAT logs
for translations and exhaustion, VPC Flow Logs for sampled traffic, Monitoring for
rates/latency/loss, and Connectivity Tests for path configuration. For high-volume
aggregation, prefer an available linked BigQuery dataset. Check schema and dry-run
cost before expensive queries. Missing VM metadata can require filtering by IP.

Cross-check another source when it resolves a material uncertainty; avoid repeating
queries once sufficient evidence exists. Metrics and sampled logs can measure different
things. Explain relevant differences instead of equating their counts. Use available
connectors or CLI/API tools without requiring a harness-specific finish tool.

Read only the relevant reference:

- `references/mcp-usage.md`: connector capabilities.
- `references/threat-analysis.md`: threat logs.
- `references/vpc-flow-analysis.md`: traffic aggregation.
- `references/cloud-nat-analysis.md`: NAT failures.
- `references/firewall-analysis.md`: firewall decisions.
- `references/metrics-analysis.md`: Monitoring APIs.
- `references/connectivity-tests.md`: path diagnosis.

Keep production investigation read-only unless remediation is authorized. Summarize
resource/time/filter scope, evidence, uncertainty, and any remaining access gap.
