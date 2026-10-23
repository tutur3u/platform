// Runtime configuration for the self-hosted Turborepo remote cache.
//
// Every bound fails closed: a missing or malformed value selects the safe
// default, and operator overrides are clamped to hard ceilings so a typo can
// never remove the cost bound.

export interface R2ObjectLike {
  uploaded: Date;
  size: number;
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBodyLike extends R2ObjectLike {
  body: ReadableStream;
}

export interface R2BucketLike {
  head(key: string): Promise<R2ObjectLike | null>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: {
      customMetadata?: Record<string, string>;
      httpMetadata?: { contentType?: string };
    }
  ): Promise<R2ObjectLike | null>;
}

export interface RateLimiterLike {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface DurableObjectStubLike {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export interface Env {
  ARTIFACTS: R2BucketLike;
  BUDGET: DurableObjectNamespaceLike;
  REQUEST_LIMITER?: RateLimiterLike;
  TURBO_CACHE_MODE?: string;
  TURBO_CACHE_TOKENS?: string;
  TURBO_CACHE_ADMIN_TOKEN_SHA256?: string;
  TURBO_CACHE_REQUIRE_SIGNATURE?: string;
  TURBO_CACHE_MAX_ARTIFACT_BYTES?: string;
  TURBO_CACHE_TTL_DAYS?: string;
  TURBO_CACHE_DAILY_CLASS_A?: string;
  TURBO_CACHE_DAILY_CLASS_B?: string;
  TURBO_CACHE_DAILY_WRITE_BYTES?: string;
  TURBO_CACHE_MONTHLY_CLASS_A_FENCE?: string;
}

export type CacheMode = 'off' | 'read-only' | 'read-write';

export interface TokenEntry {
  id: string;
  sha256: string;
  read: string[];
  write?: string;
}

export interface BudgetLimits {
  dailyClassA: number;
  dailyClassB: number;
  dailyWriteBytes: number;
  monthlyClassAFence: number;
}

export interface CacheConfig {
  mode: CacheMode;
  tokens: TokenEntry[];
  adminSha256: string | null;
  requireSignature: boolean;
  maxArtifactBytes: number;
  ttlMs: number;
  budget: BudgetLimits;
}

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_TOKENS = 32;

// [default, ceiling]. Ceilings are the documented worst-case cost envelope.
export const LIMITS = {
  maxArtifactBytes: [100 * MIB, 500 * MIB],
  ttlDays: [7, 30],
  dailyClassA: [100_000, 1_000_000],
  dailyClassB: [1_000_000, 10_000_000],
  dailyWriteBytes: [20 * GIB, 200 * GIB],
  monthlyClassAFence: [2_000_000, 10_000_000],
} as const;

const SCOPE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const TOKEN_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

function boundedInteger(
  raw: string | undefined,
  [fallback, ceiling]: readonly [number, number]
) {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return fallback;
  const value = Number(raw.trim());
  if (!Number.isSafeInteger(value) || value < 1) return fallback;
  return Math.min(value, ceiling);
}

export function parseMode(raw: string | undefined): CacheMode {
  return raw === 'read-only' || raw === 'read-write' ? raw : 'off';
}

function parseToken(value: unknown): TokenEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string' || !TOKEN_ID.test(entry.id)) return null;
  if (typeof entry.sha256 !== 'string' || !SHA256_HEX.test(entry.sha256))
    return null;
  if (!Array.isArray(entry.read) || entry.read.length < 1) return null;
  if (entry.read.length > 4) return null;
  const read = entry.read.filter(
    (scope): scope is string => typeof scope === 'string' && SCOPE.test(scope)
  );
  if (read.length !== entry.read.length) return null;
  if (new Set(read).size !== read.length) return null;
  if (entry.write === undefined)
    return { id: entry.id, sha256: entry.sha256, read };
  // A writer must read its own scope first so it reuses what it uploads,
  // and may only write the scope it names; other read scopes stay read-only.
  if (typeof entry.write !== 'string' || entry.write !== read[0]) return null;
  return { id: entry.id, sha256: entry.sha256, read, write: entry.write };
}

export function parseTokens(raw: string | undefined): TokenEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_TOKENS) return [];
  const tokens: TokenEntry[] = [];
  const ids = new Set<string>();
  for (const value of parsed) {
    const token = parseToken(value);
    // One malformed entry invalidates the whole registry: partial trust
    // configuration is an operator error that must not silently half-work.
    if (!token || ids.has(token.id)) return [];
    ids.add(token.id);
    tokens.push(token);
  }
  return tokens;
}

export function readConfig(env: Env): CacheConfig {
  const admin = env.TURBO_CACHE_ADMIN_TOKEN_SHA256?.trim().toLowerCase();
  return {
    mode: parseMode(env.TURBO_CACHE_MODE?.trim()),
    tokens: parseTokens(env.TURBO_CACHE_TOKENS),
    adminSha256: admin && SHA256_HEX.test(admin) ? admin : null,
    requireSignature: env.TURBO_CACHE_REQUIRE_SIGNATURE?.trim() !== 'false',
    maxArtifactBytes: boundedInteger(
      env.TURBO_CACHE_MAX_ARTIFACT_BYTES,
      LIMITS.maxArtifactBytes
    ),
    ttlMs: boundedInteger(env.TURBO_CACHE_TTL_DAYS, LIMITS.ttlDays) * DAY_MS,
    budget: {
      dailyClassA: boundedInteger(
        env.TURBO_CACHE_DAILY_CLASS_A,
        LIMITS.dailyClassA
      ),
      dailyClassB: boundedInteger(
        env.TURBO_CACHE_DAILY_CLASS_B,
        LIMITS.dailyClassB
      ),
      dailyWriteBytes: boundedInteger(
        env.TURBO_CACHE_DAILY_WRITE_BYTES,
        LIMITS.dailyWriteBytes
      ),
      monthlyClassAFence: boundedInteger(
        env.TURBO_CACHE_MONTHLY_CLASS_A_FENCE,
        LIMITS.monthlyClassAFence
      ),
    },
  };
}
