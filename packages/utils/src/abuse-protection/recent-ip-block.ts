import { isIPBlocked } from './index';
import type { AbuseProtectionLogContext, BlockInfo } from './types';

/** How long one isolate trusts a clean persistent-block lookup for an IP. */
export const RECENT_IP_CLEAR_TTL_MS = 10_000;
const MAX_REMEMBERED_IPS = 2_000;

const clearUntil = new Map<string, number>();

/**
 * `isIPBlocked` for the authenticated API wrappers, which also sit behind
 * the API proxy's own IP block check. A clean result (a cache miss plus a
 * database miss, two round trips) is reused in this isolate for
 * {@link RECENT_IP_CLEAR_TTL_MS}: a block created in that window, or missed
 * because a lookup failed open, reaches this isolate within it. A found block
 * is never reused. The shared `unknown` bucket is always read. Login, OTP and
 * other brute-force paths must keep calling `isIPBlocked` directly.
 */
export async function isIPBlockedReusingRecentClear(
  ipAddress: string,
  context?: AbuseProtectionLogContext
): Promise<BlockInfo | null> {
  if (ipAddress === 'unknown') return isIPBlocked(ipAddress, context);
  const now = Date.now();
  const until = clearUntil.get(ipAddress);
  if (until !== undefined) {
    if (until > now) return null;
    clearUntil.delete(ipAddress);
  }
  const block = await isIPBlocked(ipAddress, context);
  if (block) return block;
  if (clearUntil.size >= MAX_REMEMBERED_IPS) {
    const oldest = clearUntil.keys().next().value;
    if (oldest !== undefined) clearUntil.delete(oldest);
  }
  clearUntil.set(ipAddress, Date.now() + RECENT_IP_CLEAR_TTL_MS);
  return null;
}

/** Test seam: forget every remembered clean lookup. */
export function resetRecentIpClears() {
  clearUntil.clear();
}
