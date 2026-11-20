#!/usr/bin/env node
// Performance Factory regression detector. Compares current p95 TTFB and
// error rate per gateway-mounted app against a rolling baseline, tags windows
// with the active Worker version, and emits structured regression records that
// carry reproducible queries instead of raw data.
//
//   node scripts/perf/perf-regression-detector.mjs [detect] [--apps forms,tools]
//     [--window-minutes 15] [--baseline-hours 24] [--evaluate-windows 8]
//     [--now ISO] [--fixture path.json] [--out path.json]
//   node scripts/perf/perf-regression-detector.mjs rerun --record path.json
//     [--regression <id>] [--query zone-latency|worker-versions]
//
// Exit codes: 0 completed (regressions or not), 2 configuration or API error.
// Reads CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ZONE_ID by
// name; their values are never printed.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import {
  buildWorkerVersionQuery,
  buildZoneLatencyQuery,
  fetchDeploys,
  parseZoneWindows,
  readCredentials,
  redact,
  runGraphql,
} from './perf-regression-cloudflare.mjs';
import {
  DEFAULT_RULES,
  computeBaseline,
  evaluateWindows,
  suspectDeploys,
  versionSummary,
} from './perf-regression-rules.mjs';

import {
  deploymentFailureRecords,
  fetchProductionFailures,
} from './perf-deploy-failures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APPS_PATH = resolve(HERE, 'perf-apps.json');
const SELF = 'scripts/perf/perf-regression-detector.mjs';

export function parseArgs(argv) {
  const mode = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'detect';
  if (!['detect', 'rerun'].includes(mode)) {
    throw new Error(`unknown mode: ${mode}`);
  }
  const { values } = parseNodeArgs({
    args: mode === argv[0] ? argv.slice(1) : argv,
    options: {
      apps: { type: 'string' },
      'production-failures': { type: 'boolean' },
      'window-minutes': { type: 'string', default: '15' },
      'baseline-hours': { type: 'string', default: '24' },
      'evaluate-windows': { type: 'string', default: '8' },
      now: { type: 'string' },
      fixture: { type: 'string' },
      out: { type: 'string' },
      record: { type: 'string' },
      regression: { type: 'string' },
      query: { type: 'string', default: 'zone-latency' },
    },
    strict: true,
  });
  const positive = (name, max) => {
    const value = Number(values[name]);
    if (!Number.isInteger(value) || value < 1 || value > max) {
      throw new Error(`--${name} must be an integer between 1 and ${max}`);
    }
    return value;
  };
  if (mode === 'rerun' && !values.record) {
    throw new Error('rerun requires --record');
  }
  if (values.now && Number.isNaN(Date.parse(values.now))) {
    throw new Error('--now must be an ISO timestamp');
  }
  return {
    mode,
    productionFailures: values['production-failures'] ?? false,
    apps: values.apps?.split(',').filter(Boolean) ?? null,
    windowMinutes: positive('window-minutes', 60),
    baselineHours: positive('baseline-hours', 168),
    evaluateWindows: positive('evaluate-windows', 96),
    now: values.now ?? null,
    fixture: values.fixture ?? null,
    out: values.out ?? null,
    record: values.record ?? null,
    regression: values.regression ?? null,
    query: values.query,
  };
}

export function loadApps(selected, config = readJson(APPS_PATH)) {
  const names = selected ?? Object.keys(config.apps);
  return names.map((name) => {
    const app = config.apps[name];
    if (!app) throw new Error(`unknown app: ${name}`);
    return {
      name,
      host: app.host ?? config.host,
      locales: app.locales ?? config.locales,
      ...app,
    };
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Split windows into baseline and evaluation ranges ending at `now`. */
export function splitWindows(
  windows,
  { now, windowMinutes, evaluateWindows, baselineHours }
) {
  const nowMs = Date.parse(now);
  const evalStart = nowMs - evaluateWindows * windowMinutes * 60_000;
  const baselineStart = evalStart - baselineHours * 3_600_000;
  const complete = windows.filter((w) => Date.parse(w.end) <= nowMs);
  return {
    baseline: complete.filter(
      (w) =>
        Date.parse(w.start) >= baselineStart && Date.parse(w.start) < evalStart
    ),
    current: complete.filter((w) => Date.parse(w.start) >= evalStart),
  };
}

/** Pure analysis for one app; shared by live runs, fixtures and tests. */
export function analyzeApp({
  app,
  windows,
  deploys,
  options,
  rules = DEFAULT_RULES,
  detectedAt,
}) {
  const { baseline, current } = splitWindows(windows, options);
  const stats = computeBaseline(baseline, rules);
  const findings = evaluateWindows(current, stats, rules);
  const versions = versionSummary([...baseline, ...current], deploys);
  return findings.map((finding) => {
    const startMs = Date.parse(finding.startTime);
    const forensicsRange = {
      since: new Date(
        startMs - options.baselineHours * 3_600_000
      ).toISOString(),
      until: new Date(startMs + 2 * 3_600_000).toISOString(),
    };
    const queries = [
      buildZoneLatencyQuery({
        app,
        ...forensicsRange,
        windowMinutes: options.windowMinutes,
      }),
      buildWorkerVersionQuery({
        app,
        since: new Date(startMs - 2 * 3_600_000).toISOString(),
        until: forensicsRange.until,
      }),
    ];
    const id = `perf-${app.name}-${finding.metric}-${finding.startTime.replace(/[:.]/g, '')}`;
    return {
      id,
      app: app.name,
      worker: app.worker,
      metric: finding.metric,
      startTime: finding.startTime,
      detectedAt,
      baseline: finding.baseline,
      trigger: finding.trigger,
      observed: finding.observed,
      windows: finding.windows,
      baselineWindows: stats.windows,
      rule: ruleText(finding.metric, rules),
      suspects: suspectDeploys(deploys, finding.startTime, {
        windowMinutes: options.windowMinutes,
      }),
      versionSummary: versions,
      queries: queries.map((spec) => ({
        ...spec,
        rerun: `node ${SELF} rerun --record <record.json> --regression ${id} --query ${spec.name}`,
      })),
    };
  });
}

function ruleText(metric, rules) {
  return metric === 'error_rate'
    ? `>= ${rules.errorMinCount} errors and rate >= max(${rules.errorRatio}x baseline, baseline + ${rules.errorAbsoluteRate}) in one window`
    : `p95 > min(${rules.latencyRatio}x baseline, baseline + ${rules.latencyAbsoluteMs} ms) for ${rules.consecutiveWindows} consecutive windows`;
}

async function liveSeries(app, options, credentials, fetchImpl) {
  const until = new Date(options.now);
  const since = new Date(
    until.getTime() -
      options.baselineHours * 3_600_000 -
      options.evaluateWindows * options.windowMinutes * 60_000
  );
  const spec = buildZoneLatencyQuery({
    app,
    since: since.toISOString(),
    until: until.toISOString(),
    windowMinutes: options.windowMinutes,
  });
  const data = await runGraphql(spec, credentials, fetchImpl);
  const deploys = await fetchDeploys(app, credentials, fetchImpl);
  return { windows: parseZoneWindows(data, options.windowMinutes), deploys };
}

export async function detect(
  options,
  { env = process.env, fetchImpl = fetch, config } = {}
) {
  const apps = loadApps(options.apps, config);
  const fixture = options.fixture ? readJson(options.fixture) : null;
  const credentials = fixture ? null : readCredentials(env);
  const now =
    options.now ??
    (fixture ? lastWindowEnd(fixture) : flooredNow(options.windowMinutes));
  const resolved = { ...options, now };
  const regressions = [];
  const checked = [];
  for (const app of apps) {
    const series = fixture
      ? (fixture.apps?.[app.name] ?? { windows: [], deploys: [] })
      : await liveSeries(app, resolved, credentials, fetchImpl);
    const records = analyzeApp({
      app,
      windows: series.windows,
      deploys: series.deploys ?? [],
      options: resolved,
      detectedAt: now,
    });
    const { current } = splitWindows(series.windows, resolved);
    const latest = current.at(-1);
    checked.push({
      app: app.name,
      windows: series.windows.length,
      regressions: records.length,
      latest: latest
        ? {
            start: latest.start,
            requests: latest.requests,
            p95TtfbMs: latest.p95Ms,
            errorRate:
              latest.requests > 0 ? latest.errors / latest.requests : null,
          }
        : null,
    });
    regressions.push(...records);
  }
  const range = {
    since: new Date(
      Date.parse(now) - options.evaluateWindows * options.windowMinutes * 60_000
    ).toISOString(),
    until: now,
  };
  const productionFailures = options.productionFailures
    ? fixture
      ? deploymentFailureRecords(fixture.productionRuns ?? [], range)
      : fetchProductionFailures(range)
    : [];
  return {
    generatedAt: now,
    productionFailures,
    source: fixture ? 'fixture' : 'cloudflare',
    checked,
    regressions,
  };
}

function lastWindowEnd(fixture) {
  const ends = Object.values(fixture.apps ?? {}).flatMap((series) =>
    series.windows.map((window) => Date.parse(window.end))
  );
  return new Date(Math.max(...ends)).toISOString();
}

function flooredNow(windowMinutes) {
  const size = windowMinutes * 60_000;
  return new Date(Math.floor(Date.now() / size) * size).toISOString();
}

export async function rerun(
  options,
  { env = process.env, fetchImpl = fetch } = {}
) {
  const document = readJson(options.record);
  const records = document.regressions ?? [document];
  const record = options.regression
    ? records.find((entry) => entry.id === options.regression)
    : records[0];
  if (!record) throw new Error(`regression not found: ${options.regression}`);
  const spec = record.queries.find((query) => query.name === options.query);
  if (!spec) throw new Error(`query not found: ${options.query}`);
  return runGraphql(spec, readCredentials(env), fetchImpl);
}

async function main() {
  let credentialsForRedaction = null;
  try {
    credentialsForRedaction = { token: process.env.CLOUDFLARE_API_TOKEN };
    const options = parseArgs(process.argv.slice(2));
    const result =
      options.mode === 'rerun' ? await rerun(options) : await detect(options);
    let text = `${JSON.stringify(result, null, 2)}\n`;
    if (options.out) {
      text = text.replaceAll('<record.json>', options.out);
      mkdirSync(dirname(resolve(options.out)), { recursive: true });
      writeFileSync(options.out, text);
    }
    process.stdout.write(text);
  } catch (error) {
    console.error(redact(error?.message ?? error, credentialsForRedaction));
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
