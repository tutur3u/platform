import 'server-only';

import { createHash } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  type ObservabilityAlert,
  parseAlerts,
} from '@tuturuuu/utils/observability/alerts';

/**
 * Firing SLO burn alerts as Mastermind fleet sync serves them: to the owner
 * with the `alerts` feature on `GET /fleet/state`, and to the publisher on
 * `GET /fleet/alerts`. See
 * apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync.
 */
export interface FleetAlert {
  /** Opaque slug, stable per alert episode (one dedupe key). */
  id: string;
  service: string;
  severity: 'page' | 'ticket';
  indicator: 'availability' | 'latency';
  burnLong: number;
  burnShort: number;
  startedAt: string;
}

export const FLEET_MAX_ALERTS = 20;
/** Phones poll every 15 s; the evaluator itself runs per minute. */
export const FLEET_ALERTS_TTL_MS = 60_000;
/** A failed read is retried sooner, but still not on every poll. */
export const FLEET_ALERTS_FAILURE_TTL_MS = 15_000;
const READ_TIMEOUT_MS = 3_000;

/** Readable prefix plus a digest, so distinct dedupe keys never collide. */
export function fleetAlertId(dedupeKey: string) {
  const readable = dedupeKey
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, 47);
  const digest = createHash('sha256').update(dedupeKey).digest('hex');
  return `${readable || 'slo'}-${digest.slice(0, 16)}`;
}

/** Firing alerts only, page before ticket, then newest, at most 20. */
export function fleetAlertView(alerts: ObservabilityAlert[]): FleetAlert[] {
  return alerts
    .filter((alert) => alert.state === 'firing')
    .sort(
      (a, b) =>
        (a.severity === 'page' ? 0 : 1) - (b.severity === 'page' ? 0 : 1) ||
        Date.parse(b.started_at) - Date.parse(a.started_at)
    )
    .slice(0, FLEET_MAX_ALERTS)
    .map((alert) => ({
      id: fleetAlertId(alert.dedupe_key),
      service: alert.service.slice(0, 128),
      severity: alert.severity,
      indicator: alert.indicator,
      burnLong: alert.burn_long,
      burnShort: alert.burn_short,
      startedAt: alert.started_at,
    }));
}

type AlertsLoader = (signal: AbortSignal) => Promise<unknown>;

/**
 * Firing alerts only, page before ticket, then newest, limited in the
 * database, so resolved history can never crowd out a firing page. Rows
 * come back in the `private.list_observability_alerts` shape.
 */
async function loadAlertRows(signal: AbortSignal) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin
    .schema('private')
    .from('observability_alerts')
    .select(
      'dedupe_key, slo_id, service, severity, state, started_at, resolved_at, burn_long, burn_short, observability_slos(indicator, objective, latency_threshold_ms)'
    )
    .eq('state', 'firing')
    .order('severity', { ascending: true })
    .order('started_at', { ascending: false })
    .order('dedupe_key', { ascending: true })
    .limit(FLEET_MAX_ALERTS)
    .abortSignal(signal);
  if (error || !Array.isArray(data)) throw new Error('alerts_read_failed');
  return data.map(({ observability_slos: joined, ...alert }) => {
    const slo = Array.isArray(joined) ? joined[0] : joined;
    return {
      ...alert,
      indicator: slo?.indicator,
      objective: slo?.objective,
      latency_threshold_ms: slo?.latency_threshold_ms ?? null,
    };
  });
}

let memo: { alerts: FleetAlert[] | null; expiresAt: number } | undefined;
let inflight: Promise<FleetAlert[] | null> | undefined;

/** Clears the isolate memo; tests only. */
export function resetFleetAlertsCache() {
  memo = undefined;
  inflight = undefined;
}

/**
 * Firing alerts, memoized per isolate for a minute and shared by concurrent
 * callers. Null when the alerts are unavailable: callers fail open and serve
 * everything else.
 */
export async function readFleetAlerts({
  now = Date.now(),
  load = loadAlertRows,
}: { now?: number; load?: AlertsLoader } = {}) {
  if (memo && memo.expiresAt > now) return memo.alerts;
  inflight ??= (async () => {
    let alerts: FleetAlert[] | null = null;
    // The deadline cancels the request itself, so a stalled read never
    // overlaps the next one.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        load(controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('alerts_timeout'));
          }, READ_TIMEOUT_MS);
        }),
      ]);
      const rows = parseAlerts(raw);
      // A nonempty list with no usable row is malformed, not "all clear".
      alerts =
        rows && (rows.length > 0 || (raw as unknown[]).length === 0)
          ? fleetAlertView(rows)
          : null;
    } catch {
      alerts = null;
    } finally {
      clearTimeout(timer);
    }
    if (!alerts) console.warn('Mastermind fleet alerts unavailable');
    memo = {
      alerts,
      expiresAt:
        now + (alerts ? FLEET_ALERTS_TTL_MS : FLEET_ALERTS_FAILURE_TTL_MS),
    };
    return alerts;
  })().finally(() => {
    inflight = undefined;
  });
  return inflight;
}
