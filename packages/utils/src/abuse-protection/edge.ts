/**
 * Edge-compatible abuse protection utilities.
 *
 * Unlike the main index.ts (which uses node:crypto), this module only
 * relies on the @upstash/redis REST client and is safe to run in
 * Vercel Edge Runtime or Next.js proxy/middleware.
 */

import {
  getUpstashRestRedisClient,
  type UpstashRestRedisClient,
} from '../upstash-rest';
import {
  ABUSE_THRESHOLDS,
  BLOCK_DURATIONS,
  REDIS_KEYS,
  WINDOW_MS,
} from './constants';
import type { BlockInfo } from './types';

let edgeRedisClient: UpstashRestRedisClient | null = null;
let edgeRedisInitialized = false;

function parsePositiveIntEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function getEdgeRedisClient() {
  if (edgeRedisInitialized) return edgeRedisClient;

  try {
    edgeRedisClient = await getUpstashRestRedisClient();
    edgeRedisInitialized = true;
    return edgeRedisClient;
  } catch {
    edgeRedisInitialized = true;
    return null;
  }
}

/**
 * Check if an IP is blocked using Redis cache only (no DB fallback).
 * Designed for Edge Runtime where speed > completeness.
 * The serverless layer provides full DB-backed check as backup.
 */
export async function isIPBlockedEdge(
  ipAddress: string
): Promise<BlockInfo | null> {
  try {
    const redis = await getEdgeRedisClient();
    if (!redis) return null;

    const cached = await redis.get<string>(REDIS_KEYS.IP_BLOCKED(ipAddress));
    if (!cached) return null;

    const blockInfo = typeof cached === 'string' ? JSON.parse(cached) : cached;
    if (new Date(blockInfo.expiresAt) <= new Date()) return null;

    return {
      id: blockInfo.id,
      blockLevel: blockInfo.level,
      reason: blockInfo.reason,
      expiresAt: new Date(blockInfo.expiresAt),
      blockedAt: new Date(blockInfo.blockedAt),
    };
  } catch {
    // Fail-open: if Redis is unavailable, allow request through
    return null;
  }
}

export async function blockIPEdge(
  ipAddress: string,
  reason: BlockInfo['reason']
): Promise<BlockInfo | null> {
  try {
    const redis = await getEdgeRedisClient();
    if (!redis) return null;

    const currentLevel =
      (await redis.get<number>(REDIS_KEYS.IP_BLOCK_LEVEL(ipAddress))) || 0;
    const newLevel = Math.min(currentLevel + 1, 4) as 1 | 2 | 3 | 4;
    const blockDuration = BLOCK_DURATIONS[newLevel];
    const blockedAt = new Date();
    const expiresAt = new Date(blockedAt.getTime() + blockDuration * 1000);
    const blockInfo = {
      id: `edge:${ipAddress}:${blockedAt.getTime()}`,
      blockLevel: newLevel,
      reason,
      blockedAt,
      expiresAt,
    } satisfies BlockInfo;

    await Promise.all([
      redis.set(
        REDIS_KEYS.IP_BLOCKED(ipAddress),
        JSON.stringify({
          id: blockInfo.id,
          level: blockInfo.blockLevel,
          reason: blockInfo.reason,
          expiresAt: blockInfo.expiresAt.toISOString(),
          blockedAt: blockInfo.blockedAt.toISOString(),
        }),
        { ex: blockDuration }
      ),
      redis.set(REDIS_KEYS.IP_BLOCK_LEVEL(ipAddress), newLevel, {
        ex: WINDOW_MS.TWENTY_FOUR_HOURS / 1000,
      }),
    ]);

    return blockInfo;
  } catch {
    return null;
  }
}

async function recordEdgeAbuseSignal(
  ipAddress: string,
  redisKey: string,
  {
    maxAttempts,
    windowMs,
  }: {
    maxAttempts: number;
    windowMs: number;
  }
): Promise<BlockInfo | null> {
  try {
    const redis = await getEdgeRedisClient();
    if (!redis) return null;

    const attempts = await redis.incr(redisKey);

    if (attempts === 1) {
      await redis.expire(redisKey, Math.ceil(windowMs / 1000));
    }

    if (attempts < maxAttempts) {
      return null;
    }

    return blockIPEdge(ipAddress, 'api_abuse');
  } catch {
    return null;
  }
}

export async function recordMalformedAuthCookieEdge(
  ipAddress: string
): Promise<BlockInfo | null> {
  return recordEdgeAbuseSignal(
    ipAddress,
    REDIS_KEYS.API_MALFORMED_AUTH_COOKIE(ipAddress),
    {
      maxAttempts: parsePositiveIntEnv(
        'EDGE_MALFORMED_AUTH_COOKIE_MAX',
        ABUSE_THRESHOLDS.MALFORMED_AUTH_COOKIE_MAX
      ),
      windowMs: parsePositiveIntEnv(
        'EDGE_MALFORMED_AUTH_COOKIE_WINDOW_MS',
        ABUSE_THRESHOLDS.MALFORMED_AUTH_COOKIE_WINDOW_MS
      ),
    }
  );
}

export async function recordSuspiciousApiRequestEdge(
  ipAddress: string
): Promise<BlockInfo | null> {
  return recordEdgeAbuseSignal(
    ipAddress,
    REDIS_KEYS.API_SUSPICIOUS(ipAddress),
    {
      maxAttempts: parsePositiveIntEnv(
        'EDGE_SUSPICIOUS_API_MAX',
        ABUSE_THRESHOLDS.SUSPICIOUS_API_MAX
      ),
      windowMs: parsePositiveIntEnv(
        'EDGE_SUSPICIOUS_API_WINDOW_MS',
        ABUSE_THRESHOLDS.SUSPICIOUS_API_WINDOW_MS
      ),
    }
  );
}

/**
 * Lightweight IP extraction for Edge Runtime.
 * Checks standard proxy headers in priority order.
 */
export function extractIPFromRequest(headers: Headers): string {
  // cf-connecting-ip (Cloudflare)
  const cfIP = headers.get('cf-connecting-ip');
  if (cfIP && isValidIPEdge(cfIP)) return cfIP;

  // true-client-ip (some Cloudflare/enterprise proxy setups)
  const trueClientIP = headers.get('true-client-ip');
  if (trueClientIP && isValidIPEdge(trueClientIP)) return trueClientIP;

  // x-forwarded-for (most common generic proxy header)
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIP = forwardedFor.split(',')[0]?.trim();
    if (firstIP && isValidIPEdge(firstIP)) return firstIP;
  }

  // x-real-ip (Nginx)
  const realIP = headers.get('x-real-ip');
  if (realIP && isValidIPEdge(realIP)) return realIP;

  return 'unknown';
}

function isValidIPEdge(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}
