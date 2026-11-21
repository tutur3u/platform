import { expect, it } from 'vitest';
import { parseAlerts, perfFactoryRecords } from './alerts';

const firing = {
  burn_long: 20.5,
  burn_short: 30,
  dedupe_key: 'slo:workers-availability:page:tuturuuu-meet:20261121t0300',
  indicator: 'availability',
  latency_threshold_ms: null,
  objective: 0.995,
  resolved_at: null,
  service: 'tuturuuu-meet',
  severity: 'page',
  slo_id: 'workers-availability',
  started_at: '2026-11-21T03:00:00Z',
  state: 'firing',
};

it('drops malformed rows and rejects a non-array', () => {
  expect(parseAlerts({})).toBeNull();
  expect(parseAlerts([firing, { service: 'x' }, null])).toHaveLength(1);
});

it('turns firing alerts into Perf Factory records', () => {
  const alerts = parseAlerts([
    firing,
    {
      ...firing,
      dedupe_key: 'k2',
      state: 'resolved',
      resolved_at: '2026-11-21T04:00:00Z',
    },
    {
      ...firing,
      dedupe_key: 'k3',
      indicator: 'latency',
      latency_threshold_ms: 1000,
      severity: 'ticket',
    },
  ])!;
  const records = perfFactoryRecords(alerts, '2026-11-21T04:00:00Z');
  expect(records).toHaveLength(2);
  expect(records[0]).toMatchObject({
    app: 'meet',
    metric: 'error_rate',
    source: 'observability-slo',
    startTime: '2026-11-21T03:00:00Z',
    suspects: [],
    worker: 'tuturuuu-meet',
  });
  expect(records[0]?.id).toMatch(/^slo-[a-z0-9-]+$/);
  expect(records[1]).toMatchObject({
    metric: 'p95_ttfb',
    trigger: { severity: 'ticket', thresholdMs: 1000 },
  });
});
