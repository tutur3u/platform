// Framework-free shaping of SLO burn alerts, shared by Admin
// (apps/infrastructure), the Perf Factory intake and Mastermind fleet sync
// (apps/web). Input is rows in the private.list_observability_alerts shape;
// anything malformed, including an unparseable start time, is dropped.

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
    !Number.isNaN(Date.parse(row.started_at)) &&
    typeof row.burn_long === 'number' &&
    typeof row.burn_short === 'number' &&
    typeof row.objective === 'number'
  );
}

/** The well-formed alerts in `value`, or null when it is not a list. */
export function parseAlerts(value: unknown): ObservabilityAlert[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isAlert);
}
