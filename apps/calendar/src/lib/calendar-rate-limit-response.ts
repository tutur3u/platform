import type { BlockInfo } from '@tuturuuu/utils/abuse-protection';
import { NextResponse } from 'next/server';

type CalendarRateLimitReason = 'ip-already-blocked' | 'backend-auth-rate-limit';

/** Classify only the rejecting branch, never a private block/provider detail.
 * These branches do not establish a limiter policy, caller class or window. */
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
