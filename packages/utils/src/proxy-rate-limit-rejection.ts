import { type NextRequest, NextResponse } from 'next/server';
import { guardRejection } from './guard-rejection';

export function buildProxyRateLimitRejection(
  request: NextRequest,
  retryAfter: number,
  headers: Record<string, string>,
  reason: 'proxy-ip-blocked' | 'proxy-rate-limited'
) {
  return guardRejection(
    request,
    NextResponse.json(
      { error: 'Too Many Requests', message: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': `${retryAfter}`,
          ...headers,
        },
      }
    ),
    reason
  );
}
