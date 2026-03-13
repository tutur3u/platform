/**
 * Edge-compatible abuse protection utilities.
 *
 * Unlike the main index.ts (which uses node:crypto), this module only
 * relies on the @upstash/redis REST client and is safe to run in
 * Vercel Edge Runtime or Next.js proxy/middleware.
 */

import { getUpstashRestRedisClient } from '../upstash-rest';
import { REDIS_KEYS } from './constants';
import type { BlockInfo } from './types';

/**
 * Lazy-loaded Redis client for Edge Runtime.
 * Uses @upstash/redis REST API (no Node.js dependencies).
 * Typed with a minimal interface to avoid class compatibility issues across
 * different @upstash/redis resolution paths.
 */
interface EdgeRedisClient {
  get: <T = unknown>(key: string) => Promise<T | null>;
}

let edgeRedisClient: EdgeRedisClient | null = null;
let edgeRedisInitialized = false;

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
