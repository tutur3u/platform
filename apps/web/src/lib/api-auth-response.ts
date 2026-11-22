import type { NextRequest, NextResponse } from 'next/server';

export interface CacheConfig {
  /** Browser cache max-age in seconds. Only applied to 2xx GET responses. */
  maxAge: number;
  /** stale-while-revalidate window in seconds (optional). */
  swr?: number;
}

export function applyPrivateCacheControl(
  request: NextRequest,
  response: NextResponse,
  cache: CacheConfig | undefined
) {
  if (!cache || request.method !== 'GET') return;
  if (response.status < 200 || response.status >= 300) return;
  const swr =
    cache.swr === undefined ? '' : `, stale-while-revalidate=${cache.swr}`;
  response.headers.set(
    'Cache-Control',
    `private, max-age=${cache.maxAge}${swr}`
  );
}

export function applyAdaptiveRateLimitHeaders(
  response: NextResponse,
  headers: Record<string, string>
) {
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
}
