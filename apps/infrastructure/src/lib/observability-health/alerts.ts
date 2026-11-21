import { appForService } from './summary';

// Framework-free shaping of SLO burn alerts for the Fleet hub and the Perf
// Factory intake. Input is the JSON returned by
// private.list_observability_alerts; anything malformed is dropped.

export interface ObservabilityAlert {
  burn_long: number;
  burn_short: number;
  dedupe_key: string;
  indicator: 'availability' | 'latency';
  latency_threshold_ms: number | null;
  objective: number;
  resolved_at: string | null;
  service: string;
  severity: 'page' | 'ticket';
  slo_id: string;
  started_at: string;
  state: 'firing' | 'resolved';
}

/**
 * Perf Factory regression record in the detector's shape. `suspects`,
 * `versionSummary` and `queries` stay empty here; the detector fills them
 * from Worker version annotations when it takes the record in.
 */
export interface PerfFactoryRecord {
  app: string;
  baseline: null;
  baselineWindows: [];
  detectedAt: string;
  id: string;
  metric: 'error_rate' | 'p95_ttfb';
  observed: { burnLong: number; burnShort: number };
  queries: [];
  rule: string;
  source: 'observability-slo';
  startTime: string;
  suspects: [];
  trigger: {
    objective: number;
    severity: 'page' | 'ticket';
    thresholdMs: number | null;
  };
  versionSummary: [];
  windows: [];
  worker: string;
}

function isAlert(value: unknown): value is ObservabilityAlert {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.dedupe_key === 'string' &&
    typeof row.slo_id === 'string' &&
    typeof row.service === 'string' &&
    (row.severity === 'page' || row.severity === 'ticket') &&
    (row.state === 'firing' || row.state === 'resolved') &&
    (row.indicator === 'availability' || row.indicator === 'latency') &&
    typeof row.started_at === 'string' &&
    typeof row.burn_long === 'number' &&
    typeof row.burn_short === 'number' &&
    typeof row.objective === 'number'
  );
}

export function parseAlerts(value: unknown): ObservabilityAlert[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isAlert);
}

export function perfFactoryRecords(
  alerts: ObservabilityAlert[],
  detectedAt: string
): PerfFactoryRecord[] {
  return alerts
    .filter((alert) => alert.state === 'firing')
    .map((alert) => ({
      app: appForService(alert.service),
      baseline: null,
      baselineWindows: [],
      detectedAt,
      id: `slo-${alert.dedupe_key.replace(/[^a-z0-9-]/g, '-')}`,
      metric: alert.indicator === 'availability' ? 'error_rate' : 'p95_ttfb',
      observed: { burnLong: alert.burn_long, burnShort: alert.burn_short },
      queries: [],
      rule:
        alert.severity === 'page'
          ? 'burn >= 14.4 over 1 hour and the latest 15 minutes'
          : 'burn >= 6 over 6 hours and the latest hour',
      source: 'observability-slo',
      startTime: alert.started_at,
      suspects: [],
      trigger: {
        objective: alert.objective,
        severity: alert.severity,
        thresholdMs: alert.latency_threshold_ms,
      },
      versionSummary: [],
      windows: [],
      worker: alert.service,
    }));
}
