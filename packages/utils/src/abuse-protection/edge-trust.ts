/**
 * Edge-compatible trust multiplier cache.
 *
 * Bridges the server-side abuse reputation/trust system (Postgres) to the edge
 * proxy guard so that read rate limits can be scaled up for trusted accounts
 * and trusted locations (CIDRs) without a per-request database round-trip.
 *
 * Like `edge.ts`, this module only relies on the @upstash/redis REST client and
 * is safe to run in Vercel Edge Runtime / Next.js proxy middleware as well as in
 * the Node serverless layer (used by the write-through path in reputation.ts).
 *
 * Trust can never be forged from the edge: cache entries are only written by the
 * service-role write-through path keyed on hashes of real, observed subjects. A
 * fabricated subject key simply misses the cache and resolves to a 1.0
 * (neutral) multiplier — fail-open by design.
 */

import {
  getUpstashRestRedisClient,
  type UpstashRestRedisClient,
} from '../upstash-rest';

const TRUST_CACHE_PREFIX = 'trust:mult';

// Mirrors the DB CHECK constraint on trust_multiplier (> 0 AND <= 5).
const MIN_TRUST_MULTIPLIER = 0.35;
const MAX_TRUST_MULTIPLIER = 5;
const NEUTRAL_TRUST_MULTIPLIER = 1;

const DEFAULT_TRUST_CACHE_TTL_SECONDS = 3600; // 1 hour

let trustRedisClient: UpstashRestRedisClient | null = null;
let trustRedisInitialized = false;

function parsePositiveIntEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getTrustCacheTtlSeconds(): number {
  return parsePositiveIntEnv(
    'EDGE_TRUST_CACHE_TTL_SECONDS',
    DEFAULT_TRUST_CACHE_TTL_SECONDS
  );
}

async function getTrustRedisClient() {
  if (trustRedisInitialized) return trustRedisClient;

  try {
    trustRedisClient = await getUpstashRestRedisClient();
    trustRedisInitialized = true;
    return trustRedisClient;
  } catch {
    trustRedisInitialized = true;
    return null;
  }
}

/**
 * Maps an abuse reputation subject key (e.g. `user:<id>`, `session:<hash>`,
 * `cidr:1.2.3.0/24`) to its trust-cache Redis key.
 */
export function buildTrustCacheKey(subjectKey: string): string {
  return `${TRUST_CACHE_PREFIX}:${subjectKey}`;
}

function clampMultiplier(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return NEUTRAL_TRUST_MULTIPLIER;
  }

  return Math.min(MAX_TRUST_MULTIPLIER, Math.max(MIN_TRUST_MULTIPLIER, value));
}

function parseMultiplier(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Resolves the cached trust multiplier for each provided subject key.
 *
 * Returns a map of subject key -> clamped multiplier for keys that have a cache
 * entry above the neutral baseline. Missing keys are omitted. Returns an empty
 * map on any Redis error (fail-open). Lets callers distinguish account trust
 * (session key) from location trust (cidr/ip keys).
 */
export async function getCachedTrustMultipliers(
  subjectKeys: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (subjectKeys.length === 0) {
    return result;
  }

  try {
    const redis = await getTrustRedisClient();
    if (!redis) {
      return result;
    }

    const cacheKeys = subjectKeys.map(buildTrustCacheKey);
    const values = await redis.mget<unknown[]>(...cacheKeys);

    subjectKeys.forEach((subjectKey, index) => {
      const parsed = parseMultiplier(values[index]);
      if (parsed != null && parsed > NEUTRAL_TRUST_MULTIPLIER) {
        result.set(subjectKey, clampMultiplier(parsed));
      }
    });

    return result;
  } catch {
    // Fail-open: trust uplift is a best-effort optimization, never a gate.
    return result;
  }
}

/**
 * Resolves the most-trusting cached multiplier across the provided subject keys.
 *
 * Returns the max multiplier present (most-trusting wins, consistent with the
 * DB `get_rate_limit_trust_decision` ordering where trusted > standard). Returns
 * a neutral 1.0 when nothing is cached or on any Redis error (fail-open).
 */
export async function getCachedTrustMultiplier(
  subjectKeys: string[]
): Promise<number> {
  const multipliers = await getCachedTrustMultipliers(subjectKeys);

  let best = NEUTRAL_TRUST_MULTIPLIER;
  for (const value of multipliers.values()) {
    if (value > best) {
      best = value;
    }
  }

  return clampMultiplier(best);
}

/**
 * Write-through a single subject's trust multiplier to the edge cache.
 */
export async function setCachedTrustMultiplier(
  subjectKey: string,
  multiplier: number,
  ttlSeconds: number = getTrustCacheTtlSeconds()
): Promise<void> {
  try {
    const redis = await getTrustRedisClient();
    if (!redis) {
      return;
    }

    await redis.set(
      buildTrustCacheKey(subjectKey),
      clampMultiplier(multiplier),
      {
        ex: ttlSeconds,
      }
    );
  } catch {
    // Cache writes must never block the protected request path.
  }
}

/**
 * Write-through the same trust multiplier to every subject key resolved for a
 * request. Used by the reputation write-through path and the reconciliation
 * cron. Skips writes entirely for the neutral multiplier to avoid pinning
 * standard subjects in the cache.
 */
export async function writeTrustCacheForSubjects(
  subjectKeys: string[],
  multiplier: number,
  ttlSeconds: number = getTrustCacheTtlSeconds()
): Promise<void> {
  const clamped = clampMultiplier(multiplier);
  if (subjectKeys.length === 0 || clamped === NEUTRAL_TRUST_MULTIPLIER) {
    return;
  }

  try {
    const redis = await getTrustRedisClient();
    if (!redis) {
      return;
    }

    await Promise.all(
      subjectKeys.map((subjectKey) =>
        redis.set(buildTrustCacheKey(subjectKey), clamped, { ex: ttlSeconds })
      )
    );
  } catch {
    // Cache writes must never block the protected request path.
  }
}
