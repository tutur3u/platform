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

export interface ParsedRateLimitBucket {
  callerClass: string | null;
  key: string;
  operation: 'get' | 'mutate' | null;
  policy: string | null;
  subject: string | null;
  subjectKind: string | null;
  trustSuffix: string | null;
  window: 'minute' | 'hour' | 'day' | null;
}

const RATE_LIMIT_OPERATIONS = new Set(['get', 'mutate']);
const RATE_LIMIT_WINDOWS = new Set(['minute', 'hour', 'day']);

function isTrustSuffix(segment: string | undefined) {
  return (
    !!segment &&
    (segment === 'unl' || segment.startsWith('t') || segment.startsWith('abs-'))
  );
}

function getSubjectKind(subject: string | null) {
  if (!subject) return null;
  const separatorIndex = subject.indexOf(':');
  return separatorIndex > 0 ? subject.slice(0, separatorIndex) : subject;
}

export function parseRateLimitBucketKey(
  key: string,
  prefixBase = 'proxy:web:api'
): ParsedRateLimitBucket {
  const prefixParts = prefixBase.split(':');
  const parts = key.split(':');
  const prefixMatches = prefixParts.every(
    (part, index) => parts[index] === part
  );

  if (!prefixMatches) {
    return {
      callerClass: null,
      key,
      operation: null,
      policy: null,
      subject: null,
      subjectKind: null,
      trustSuffix: null,
      window: null,
    };
  }

  const policyIndex = prefixParts.length;
  const policy = parts[policyIndex] ?? null;
  const callerClass = parts[policyIndex + 1] ?? null;
  let operationIndex = policyIndex + 2;
  let trustSuffix: string | null = null;

  if (isTrustSuffix(parts[operationIndex])) {
    trustSuffix = parts[operationIndex]!;
    operationIndex += 1;
  }

  const operation = parts[operationIndex] ?? null;
  const window = parts[operationIndex + 1] ?? null;
  const subjectParts = parts.slice(operationIndex + 2);
  const subject = subjectParts.length > 0 ? subjectParts.join(':') : null;
  const normalizedOperation = RATE_LIMIT_OPERATIONS.has(operation ?? '')
    ? (operation as ParsedRateLimitBucket['operation'])
    : null;
  const normalizedWindow = RATE_LIMIT_WINDOWS.has(window ?? '')
    ? (window as ParsedRateLimitBucket['window'])
    : null;

  return {
    callerClass,
    key,
    operation: normalizedOperation,
    policy,
    subject,
    subjectKind: getSubjectKind(subject),
    trustSuffix,
    window: normalizedWindow,
  };
}

/**
 * Cursor-based SCAN over edge rate-limit bucket keys (best-effort — SCAN is
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
