import type { ObservabilityAlert } from '@tuturuuu/utils/observability/alerts';
import { appForService } from './summary';

// Perf Factory shaping of SLO burn alerts; the alert type and parser live in
// @tuturuuu/utils/observability/alerts.

export {
  type ObservabilityAlert,
  parseAlerts,
} from '@tuturuuu/utils/observability/alerts';

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
