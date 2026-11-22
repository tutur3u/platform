// Firing SLO burn alerts for the orchestrator Mac. After answer pickup, the
// publisher pulls them over its HMAC channel and keeps the latest list in
// alerts.json for the local orchestrator to read; the Mac never holds an
// infrastructure credential.
// Runbook: apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync
import { randomUUID } from 'node:crypto';

export const ALERTS_PATH = '/api/v1/mastermind/fleet/alerts';
/**
 * The pull runs only with this much of the tick left. It comes after the
 * snapshot PUT and the answer pickup, so it never takes their time.
 */
export const ALERTS_MIN_REMAINING_MS = 4_000;
const MAX_ALERTS = 20;
const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SEVERITY = new Set(['page', 'ticket']);
const INDICATOR = new Set(['availability', 'latency']);
const burn = (value) => typeof value === 'number' && Number.isFinite(value);

/** The route's alert list, re-checked field by field; null if unusable. */
export function parseFleetAlerts(value) {
  if (!Array.isArray(value)) return null;
  return value
    .filter(
      (alert) =>
        alert &&
        typeof alert === 'object' &&
        typeof alert.id === 'string' &&
        SLUG.test(alert.id) &&
        typeof alert.service === 'string' &&
        alert.service.length > 0 &&
        alert.service.length <= 128 &&
        SEVERITY.has(alert.severity) &&
        INDICATOR.has(alert.indicator) &&
        burn(alert.burnLong) &&
        burn(alert.burnShort) &&
        typeof alert.startedAt === 'string' &&
        !Number.isNaN(Date.parse(alert.startedAt))
    )
    .slice(0, MAX_ALERTS)
    .map((alert) => ({
      id: alert.id,
      service: alert.service,
      severity: alert.severity,
      indicator: alert.indicator,
      burnLong: alert.burnLong,
      burnShort: alert.burnShort,
      startedAt: alert.startedAt,
    }));
}

/**
 * Pulls the firing alerts and replaces `file` atomically (mode 0600) with
 * `{ fetchedAt, alerts }`. A skip or failure leaves the previous file in
 * place. Returns counts only, for the log line.
 */
export async function pullAlerts({ get, write, file, tickEnd, now }) {
  if (tickEnd - Date.now() < ALERTS_MIN_REMAINING_MS)
    return { skipped: 'budget' };
  try {
    const raw = (await get(`${ALERTS_PATH}?nonce=${randomUUID()}`))?.alerts;
    const alerts = parseFleetAlerts(raw);
    // A nonempty list with no usable row is malformed, not "all clear".
    if (!alerts || (alerts.length === 0 && raw.length > 0))
      return { failed: true };
    write(file, { fetchedAt: now.toISOString(), alerts });
    return {
      firing: alerts.length,
      pages: alerts.filter((alert) => alert.severity === 'page').length,
    };
  } catch (error) {
    return error?.name === 'RateLimitedError'
      ? { skipped: 'rate_limited' }
      : { failed: true };
  }
}
