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

// Mirrors the DB CHECK constraint on trust_multiplier (> 0 AND <= 1000).
const MIN_TRUST_MULTIPLIER = 0.35;
const MAX_TRUST_MULTIPLIER = 1000;
const NEUTRAL_TRUST_MULTIPLIER = 1;

/**
 * A cached rate-limit decision for a subject as seen by the edge proxy. Stored
 * as a plain number for the common multiplier-only case (back-compat), or as a
 * JSON object when an admin rule carries a richer mode.
 */
export interface CachedTrustEntry {
  /** Read-limit multiplier (uplift). 1 = neutral. Ignored when mode=unlimited. */
  m: number;
  /** Admin rule mode. Absent = plain multiplier. */
  mode?: 'absolute' | 'unlimited';
  /** For mode=absolute: explicit per-window READ limits. */
  abs?: { minute?: number; hour?: number; day?: number };
  /** Server-verified session marker. Does not increase limits by itself. */
  verified?: boolean;
}

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

function parseAbsLimits(value: unknown): CachedTrustEntry['abs'] | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const abs: { minute?: number; hour?: number; day?: number } = {};
  for (const window of ['minute', 'hour', 'day'] as const) {
    const parsed = parseMultiplier(source[window]);
    if (parsed != null && parsed > 0) {
      abs[window] = Math.floor(parsed);
    }
  }

  return abs.minute != null || abs.hour != null || abs.day != null
    ? abs
    : undefined;
}

/**
 * Parses a cached value into a {@link CachedTrustEntry}, accepting BOTH legacy
 * plain numbers/numeric strings (back-compat) and the richer JSON object form.
 */
function parseEntry(value: unknown): CachedTrustEntry | null {
  const asNumber = parseMultiplier(value);
  if (asNumber != null) {
    return { m: clampMultiplier(asNumber) };
  }

  let source: unknown = value;
  if (typeof value === 'string') {
    try {
      source = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!source || typeof source !== 'object') {
    return null;
  }

  const record = source as Record<string, unknown>;
  const m = clampMultiplier(
    parseMultiplier(record.m) ?? NEUTRAL_TRUST_MULTIPLIER
  );
  const mode =
    record.mode === 'absolute' || record.mode === 'unlimited'
      ? record.mode
      : undefined;
  const abs = parseAbsLimits(record.abs);
  const verified = record.verified === true;

  const entry: CachedTrustEntry = { m };
  if (mode) {
    entry.mode = mode;
  }
  if (abs) {
    entry.abs = abs;
  }
  if (verified) {
    entry.verified = true;
  }
  return entry;
}

/** Serializes an entry for storage: plain number when multiplier-only. */
function serializeEntry(entry: CachedTrustEntry): number | CachedTrustEntry {
  const m = clampMultiplier(entry.m);
  if (!entry.mode && !entry.abs && !entry.verified) {
    return m;
  }

  const serialized: CachedTrustEntry = { m };
  if (entry.mode) {
    serialized.mode = entry.mode;
  }
  if (entry.abs) {
    const abs: { minute?: number; hour?: number; day?: number } = {};
    for (const window of ['minute', 'hour', 'day'] as const) {
      if (entry.abs[window] != null) {
        abs[window] = entry.abs[window];
      }
    }
    if (abs.minute != null || abs.hour != null || abs.day != null) {
      serialized.abs = abs;
    }
  }
  if (entry.verified) {
    serialized.verified = true;
  }
  return serialized;
}

function isActiveEntry(entry: CachedTrustEntry): boolean {
  return (
    entry.mode != null ||
    entry.verified === true ||
    entry.m > NEUTRAL_TRUST_MULTIPLIER
  );
}

/**
 * Resolves the cached trust multiplier for each provided subject key.
 *
 * Returns a map of subject key -> clamped multiplier for keys that have a cache
 * entry above the neutral baseline, admin-mode entries, or neutral verified
 * session entries. Missing keys are omitted. Returns an empty map on any Redis
 * error (fail-open). Lets callers distinguish account trust (session key) from
 * location trust (cidr/ip keys).
 */
export async function getCachedTrustEntries(
  subjectKeys: string[]
): Promise<Map<string, CachedTrustEntry>> {
  const result = new Map<string, CachedTrustEntry>();
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
      const entry = parseEntry(values[index]);
      if (entry && isActiveEntry(entry)) {
        result.set(subjectKey, entry);
      }
    });

    return result;
  } catch {
    // Fail-open: trust uplift is a best-effort optimization, never a gate.
    return result;
  }
}

export async function getCachedTrustMultipliers(
  subjectKeys: string[]
): Promise<Map<string, number>> {
  const entries = await getCachedTrustEntries(subjectKeys);
  const result = new Map<string, number>();
  for (const [subjectKey, entry] of entries) {
    result.set(subjectKey, entry.m);
  }
  return result;
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
 * Write-through a single subject's full rate-limit entry (multiplier + optional
 * absolute/unlimited mode) to the edge cache. Stored as a plain number for the
 * multiplier-only case (back-compat), JSON otherwise.
 */
export async function setCachedTrustEntry(
  subjectKey: string,
  entry: CachedTrustEntry,
  ttlSeconds: number = getTrustCacheTtlSeconds()
): Promise<void> {
  try {
    const redis = await getTrustRedisClient();
    if (!redis) {
      return;
    }

    await redis.set(buildTrustCacheKey(subjectKey), serializeEntry(entry), {
      ex: ttlSeconds,
    });
  } catch {
    // Cache writes must never block the protected request path.
  }
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

/**
 * Write-through a neutral marker for server-verified browser/app sessions.
 * This only proves the session cookie was successfully validated downstream; it
 * does not grant a read-limit multiplier or admin override.
 */
export async function writeVerifiedSessionCacheForSubjects(
  subjectKeys: string[],
  ttlSeconds: number = getTrustCacheTtlSeconds()
): Promise<void> {
  const sessionKeys = subjectKeys.filter((subjectKey) =>
    subjectKey.startsWith('session:')
  );
  if (sessionKeys.length === 0) {
    return;
  }

  try {
    const redis = await getTrustRedisClient();
    if (!redis) {
      return;
    }

    const verifiedEntry = serializeEntry({
      m: NEUTRAL_TRUST_MULTIPLIER,
      verified: true,
    });
    await Promise.all(
      sessionKeys.map((subjectKey) =>
        redis.set(buildTrustCacheKey(subjectKey), verifiedEntry, {
          ex: ttlSeconds,
        })
      )
    );
  } catch {
    // Cache writes must never block the protected request path.
  }
}
