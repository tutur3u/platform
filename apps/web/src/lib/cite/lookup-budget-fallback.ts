import 'server-only';

import { createHash } from 'node:crypto';

export const LOOKUP_FALLBACK_IP_LIMIT = 10;
/** Per server instance; the shared budget stays authoritative whenever it is reachable. */
export const LOOKUP_FALLBACK_GLOBAL_LIMIT = 60;
const MAX_TRACKED_CLIENTS = 2048;

type Window = { minute: number; used: number; clients: Map<string, number> };
let current: Window | null = null;
let warnedMinute = -1;

export type InstanceLookupResult =
  | { kind: 'allowed'; fallback: true }
  | { kind: 'rejected'; status: 429; retryAfter: number };

/**
 * Conservative in-memory budget used only while the shared budget store is
 * unavailable, so public lookups stay usable instead of failing closed. Each
 * minute starts a fresh window, which bounds memory to one window of hashed
 * client keys. An allowed result carries `fallback` so callers can withhold
 * work that needs the shared budget, and the error-level log raises an alert.
 */
export function reserveInstanceLookup(
  ip: string,
  now = Date.now()
): InstanceLookupResult {
  const minute = Math.floor(now / 60_000);
  const retryAfter = Math.max(1, 60 - Math.floor((now % 60_000) / 1000));
  if (warnedMinute !== minute) {
    warnedMinute = minute;
    console.error('cite_lookup_budget_fallback');
  }
  if (!current || current.minute !== minute)
    current = { minute, used: 0, clients: new Map() };
  const key = createHash('sha256').update(ip).digest('hex');
  const clientUsed = current.clients.get(key) ?? 0;
  if (
    current.used >= LOOKUP_FALLBACK_GLOBAL_LIMIT ||
    clientUsed >= LOOKUP_FALLBACK_IP_LIMIT ||
    (clientUsed === 0 && current.clients.size >= MAX_TRACKED_CLIENTS)
  )
    return { kind: 'rejected', status: 429, retryAfter };
  current.clients.set(key, clientUsed + 1);
  current.used += 1;
  return { kind: 'allowed', fallback: true };
}

export function resetInstanceLookupBudget() {
  current = null;
  warnedMinute = -1;
}
