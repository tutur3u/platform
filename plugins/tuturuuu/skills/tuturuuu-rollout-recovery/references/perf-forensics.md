# Perf Forensics

Reusable investigation procedure for a latency or error-rate regression. It
answers four questions with evidence: what changed, which metrics deteriorated,
when it started, and which requests were affected. The Performance Factory
stage prompts in [perf-factory/](perf-factory/) call this procedure; the
workflow is described in `apps/docs/build/devops/performance-factory.mdx`.

## Ground rules

- Read-only. Forensics never deploys, rolls back, purges caches, writes to a
  production database or changes routing. Recovery actions belong to
  `$tuturuuu-rollout-recovery` and the release authority.
- Store **reproducible queries, not raw data**. Every step below records the
  exact command or query text, its time range in UTC, and a one-line summary of
  the result. A later agent must be able to rerun it and get the same answer
  for a closed time range. Never paste tokens, cookies, request bodies, emails
  or user identifiers into the task record.
- Secrets come from environment variables by name only
  (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`,
  `VERCEL_TOKEN`). Never echo or log their values.
- No builds on the M4. Device and browser measurements run on a Studio host or
  devbox through `ttr resources run`.
- Times in the record are UTC ISO-8601; user-facing summaries add ICT (GMT+7).

## Evidence record

Append one entry per step to the task record's `evidence` array:

```json
{
  "step": "cf-version-cpu",
  "question": "did CPU time per request change with the new version?",
  "range": { "since": "2026-11-19T20:00:00Z", "until": "2026-11-19T23:00:00Z" },
  "query": "<exact command or GraphQL text + variables>",
  "result": "cpuTimeP99 41 ms -> 118 ms on version 8c1f..., requests flat",
  "supports": "H1"
}
```

Hypotheses are listed as `H1..Hn` with a status of `supported`, `refuted` or
`open`. A diagnosis names one supported hypothesis and states why each
alternative was refuted.

## 1. Frame the regression

1. Load the detector record (`scripts/perf/perf-regression-detector.mjs`
   output). Rerun its stored `zone-latency` query with
   `node scripts/perf/perf-regression-detector.mjs rerun --record <file>
   --regression <id> --query zone-latency` and confirm the breach still shows.
   If it does not, record `not-reproduced` and stop.
2. Bound the start: the first breaching window start, and the last healthy
   window before it.
3. List what changed in `[start - 2h, start + 15m]`:
   - Worker versions and deployments (the record's `suspects`).
   - `git log --format='%h %cI %s' <healthy-sha>..<suspect-sha> -- apps/<app>
     packages/` for the source range. When only a short SHA is known, resolve it
     with `git rev-parse --verify <short>^{commit}` locally rather than the
     GitHub API.
   - Gateway manifest or cache-rule changes (`apps/gateway/src/manifest.json`,
     `cache-rules.ts`), Supabase migrations, Vercel deploys of `apps/web`, and
     upstream incidents (Cloudflare and Supabase status pages).

## 2. Cloudflare Workers apps behind the gateway

Apps mounted at `tuturuuu.com/<app>` (Forms, Tools, Roadmap and others in
`scripts/perf/perf-apps.json`) are measured at two layers.

**Gateway TTFB and errors per window** — the detector's `zone-latency` query
(`httpRequestsAdaptiveGroups`, `edgeTimeToFirstByteMsP50/P95/P99`,
`originResponseDurationMsP95`, 5xx count). Narrow it by adding
`clientRequestPath_like` for a single route, or split by
`edgeResponseStatus`, `cacheStatus` or `clientCountryName` in `dimensions`.
Origin duration close to TTFB means the Worker is slow; a gap means edge,
network or gateway work.

**Worker CPU and wall time per version** — the detector's `worker-versions`
query (`workersInvocationsAdaptive`, `scriptVersion`, `cpuTimeP50/P99`,
`wallTimeP50/P99`, `subrequests`). CPU flat with wall time up points at
subrequests (Supabase, internal API, KV); CPU up points at code. Compare
`subrequests / requests` between versions to spot duplicated lookups. If the
schema rejects a field, run a GraphQL introspection query for the dataset and
record the corrected query.

**Gateway timing and cache headers** — probe the affected routes cold and warm:

```bash
node scripts/perf/app-switch-lab.mjs ttfb \
  --urls https://tuturuuu.com/forms/<public-path>,https://tuturuuu.com/forms
curl -s -o /dev/null -D - -w 'ttfb=%{time_starttransfer}\n' \
  https://tuturuuu.com/forms/<public-path>
```

Record `x-gateway-cache` (`HIT`, `STALE`, `MISS`, `BYPASS`, `FAMILY`), `age`,
`cf-cache-status`, `cf-ray` and `server-timing` when present. A drop in the HIT
share with unchanged origin latency is a cache regression, not a code
regression. Probe only public routes or a synthetic automation identity.

**Worker logs** — `node scripts/ci/cf-worker-observability.mjs` gives a bounded
recent-invocation review; store the command, not the output.

## 3. Vercel-hosted apps/web

- Deploys: `vercel ls web --prod` and `vercel inspect <deployment-url>` for the
  deployment commit and build output; the live commit is the production alias
  deployment, not the production branch.
- Function durations and errors: the Vercel Observability view for the project,
  filtered to the affected route and time range; record the filter set as the
  query. Speed Insights, when enabled for the project, gives route-level TTFB and
  Web Vitals by deployment.
- Route budget: a deploy rejected for the 2,048 routing-rule limit is a
  deploy-time regression. Read the CI log line from
  `node scripts/ci/check-web-vercel-route-budget.js` (budget 1,948) with
  `gh run view <run-id> --log | grep 'Web Vercel output routes'`, then diff the
  route inventory between the last accepted and the rejected commit
  (`git diff --stat <good>..<bad> -- 'apps/web/src/app/**/route.ts'
  'apps/web/src/app/**/page.tsx'`).
- Release follow-through and alias identity: `$tuturuuu-rollout-recovery`
  references.

## 4. Supabase query side

Run read-only inspection against the linked project; never mutate.

```bash
supabase inspect db outliers --linked
supabase inspect db calls --linked
supabase inspect db long-running-queries --linked
```

Or the equivalent SQL with a read-only role:

```sql
select queryid, calls, round(mean_exec_time::numeric, 1) as mean_ms,
       round(total_exec_time::numeric) as total_ms, rows, left(query, 160)
from extensions.pg_stat_statements
order by total_exec_time desc
limit 20;
```

`pg_stat_statements` is cumulative; take two snapshots across the regression
window and compare `calls` and `total_exec_time` deltas per `queryid`. Record
`queryid`, not query text with literals. Check new RLS policies, missing
indexes from recent migrations and N+1 patterns (calls per request rising with
the suspect version). Supabase log explorer queries on `postgres_logs` and
`edge_logs` are stored as their SQL text and time range.

## 5. Flutter mobile startup and resume

- Field signal: Crashlytics app-hang/ANR and non-fatal trends by app version,
  and Analytics `app_open` / screen timing by version where exported. Record the
  console filter (app, version, platform, range).
- Lab measurement on a device host (never the M4):
  `flutter run --profile --trace-startup` on a pinned simulator or device,
  reading `timeToFirstFrameMicros` and `timeToFirstFrameRasterizedMicros` from
  `build/start_up_info.json`; repeat five times per build for the healthy and
  suspect commits. For resume, use an integration test under
  `apps/mobile/integration_test/perf/` and record the test name and command.
- Startup barriers and overlapping local reads are described in
  `apps/docs/build/development-tools/mobile-state-regressions.mdx`.

## 6. Diagnosis

Write the diagnosis as: suspected cause, the commit or version, the evidence
IDs that support it, the alternatives refuted (cache, upstream incident,
traffic mix, cold starts, region), the affected requests (routes, status,
share of traffic), and confidence. Leave `open` anything the evidence cannot
settle; an adversarial reviewer will check every claim against the stored
queries.
