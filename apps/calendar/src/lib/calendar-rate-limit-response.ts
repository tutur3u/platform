import type { BlockInfo } from '@tuturuuu/utils/abuse-protection';
import { NextResponse } from 'next/server';

type CalendarRateLimitReason = 'ip-already-blocked' | 'backend-auth-rate-limit';

/** Expose the rejecting layer without private block or provider details. */
export function buildCalendarRateLimitResponse(
  retryAfter: number,
  reason: CalendarRateLimitReason
) {
  return NextResponse.json(
    { error: 'Too Many Requests', message: 'Rate limit exceeded' },
    {
      status: 429,
      headers: {
        'Cache-Control': 'private, no-store',
        'Retry-After': `${retryAfter}`,
        'X-Proxy-Block-Reason': reason,
        'X-RateLimit-Caller-Class': 'unknown',
        'X-RateLimit-Window': 'unknown',
        'X-RateLimit-Policy':
          reason === 'ip-already-blocked'
            ? 'calendar-route-ip-block'
            : 'calendar-auth-provider',
      },
    }
  );
}

export function buildIpBlockResponse(blockInfo: BlockInfo) {
  return buildCalendarRateLimitResponse(
    Math.max(1, Math.ceil((blockInfo.expiresAt.getTime() - Date.now()) / 1000)),
    'ip-already-blocked'
  );
}
