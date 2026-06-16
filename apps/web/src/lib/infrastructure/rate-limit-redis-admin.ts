import {
  type CachedTrustEntry,
  getCachedTrustEntries,
} from '@tuturuuu/utils/abuse-protection/edge-trust';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';

/**
 * Server-only readers for live edge (Redis) rate-limit state. Used by the admin
 * center to show what the edge will actually apply right now. Never import this
 * from the edge proxy guard — it is for Node route handlers only.
 */

/**
 * Reads the live edge trust-cache entries for the given subject keys, so each
 * admin rule can show whether its uplift has propagated to the edge yet.
 */
export async function readEdgeTrustState(
  subjectKeys: string[]
): Promise<Map<string, CachedTrustEntry>> {
  if (subjectKeys.length === 0) {
    return new Map();
  }
  return getCachedTrustEntries(subjectKeys);
}

export interface ReadUsageScan {
  available: boolean;
  cursor: string;
  keys: string[];
}

/**
 * Cursor-based SCAN over edge read-limit bucket keys (best-effort — SCAN is
 * incremental, not the blocking KEYS). Returns matched keys for one page.
 */
export async function scanReadUsageKeys(
  match: string,
  cursor = '0',
  count = 100
): Promise<ReadUsageScan> {
  try {
    const redis = await getUpstashRestRedisClient();
    if (!redis) {
      return { available: false, cursor: '0', keys: [] };
    }

    const [nextCursor, keys] = await redis.scan(cursor, {
      count: Math.min(Math.max(count, 1), 1000),
      match,
    });

    return {
      available: true,
      cursor: String(nextCursor),
      keys: Array.isArray(keys) ? (keys as string[]) : [],
    };
  } catch {
    return { available: false, cursor: '0', keys: [] };
  }
}
