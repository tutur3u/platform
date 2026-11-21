#!/usr/bin/env node
// Performance Factory intake for SLO burn alerts. Reads the Admin alerts
// route and writes its firing alerts as regression records in the
// detector's shape, so the dispatcher handles them like its own.
//
//   node scripts/perf/perf-observability-alerts.mjs --out path.json
//     [--fixture path.json]
//
// Exit codes: 0 completed (alerts or not), 2 configuration or API error.
// Reads PERF_FACTORY_ADMIN_ORIGIN and PERF_FACTORY_ADMIN_TOKEN (a root
// member's bearer token with view_infrastructure) by name; their values are
// never printed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const ORIGIN_ENV = 'PERF_FACTORY_ADMIN_ORIGIN';
export const TOKEN_ENV = 'PERF_FACTORY_ADMIN_TOKEN';
export const ALERTS_PATH = '/api/v1/infrastructure/observability/alerts';
const MAX_BYTES = 1_048_576;

/** Keeps only well-formed observability regression records. */
export function intakeRecords(document) {
  const regressions = Array.isArray(document?.regressions)
    ? document.regressions
    : [];
  return regressions.filter(
    (record) =>
      record?.source === 'observability-slo' &&
      typeof record.id === 'string' &&
      /^slo-[a-z0-9-]+$/.test(record.id) &&
      typeof record.app === 'string' &&
      typeof record.worker === 'string' &&
      (record.metric === 'error_rate' || record.metric === 'p95_ttfb') &&
      typeof record.startTime === 'string' &&
      Number.isFinite(Date.parse(record.startTime))
  );
}

export async function fetchAlerts(env = process.env, fetchImpl = fetch) {
  const origin = env[ORIGIN_ENV];
  const token = env[TOKEN_ENV];
  if (!origin || !token) throw new Error(`Set ${ORIGIN_ENV} and ${TOKEN_ENV}`);
  const url = new URL(ALERTS_PATH, origin);
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1')
    throw new Error(`${ORIGIN_ENV} must be https`);
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Alerts route answered ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error('Alerts response too large');
  return JSON.parse(text);
}

async function main() {
  const { values } = parseArgs({
    options: { fixture: { type: 'string' }, out: { type: 'string' } },
  });
  if (!values.out) throw new Error('--out is required');
  const document = values.fixture
    ? JSON.parse(readFileSync(values.fixture, 'utf8'))
    : await fetchAlerts();
  const regressions = intakeRecords(document);
  const out = resolve(values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify({ source: 'observability-slo', regressions }, null, 2)}\n`
  );
  console.log(`observability alerts: ${regressions.length} regression(s)`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Alerts intake failed'
    );
    process.exitCode = 2;
  });
}
