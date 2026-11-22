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
const MOBILE_KINDS = new Set(['new', 'regression', 'spike', 'test']);
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

/** Allow only aggregate fields in the orchestrator's local copy. */
export function parseMobileIssues(value) {
  if (!Array.isArray(value)) return null;
  return value
    .filter(
      (alert) =>
        alert &&
        typeof alert.id === 'string' &&
        /^mobile-[a-f0-9]{32}$/.test(alert.id) &&
        typeof alert.issueId === 'string' &&
        /^[a-f0-9]{32}$/.test(alert.issueId) &&
        (alert.platform === 'ios' || alert.platform === 'android') &&
        MOBILE_KINDS.has(alert.kind) &&
        (alert.priority === 'fyi' || alert.priority === 'decision') &&
        Number.isSafeInteger(alert.build) &&
        alert.build > 0 &&
        Number.isSafeInteger(alert.count) &&
        alert.count > 0 &&
        typeof alert.startedAt === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(alert.startedAt)
    )
    .slice(0, MAX_ALERTS)
    .map(
      ({ id, issueId, platform, kind, priority, build, count, startedAt }) => ({
        id,
        issueId,
        platform,
        kind,
        priority,
        build,
        count,
        startedAt,
      })
    );
}

/**
 * Pulls the firing alerts and replaces `file` atomically (mode 0600) with
 * `{ fetchedAt, alerts, mobileIssues? }`. A skip or failure leaves the previous file in
 * place. Returns counts only, for the log line.
 */
export async function pullAlerts({ get, write, file, tickEnd, now }) {
  if (tickEnd - Date.now() < ALERTS_MIN_REMAINING_MS)
    return { skipped: 'budget' };
  try {
    const response = await get(`${ALERTS_PATH}?nonce=${randomUUID()}`);
    const raw = response?.alerts;
    const alerts = parseFleetAlerts(raw);
    // A nonempty list with no usable row is malformed, not "all clear".
    if (!alerts || (alerts.length === 0 && raw.length > 0))
      return { failed: true };
    const mobileIssues =
      response.mobileIssues === undefined
        ? undefined
        : parseMobileIssues(response.mobileIssues);
    write(file, {
      fetchedAt: now.toISOString(),
      alerts,
      ...(mobileIssues ? { mobileIssues } : {}),
    });
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
