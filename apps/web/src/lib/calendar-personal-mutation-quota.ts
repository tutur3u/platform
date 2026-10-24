import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import type { NextRequest, NextResponse } from 'next/server';
import {
  getAdaptiveRateLimitConfig,
  recordResponseAbuseSignal,
  resolveWebAbuseDecision,
} from './abuse-risk';
import { checkRateLimit } from './rate-limit';

/** Retain personal response signals and mutation limits without a browser challenge. */
export async function calendarPersonalSessionControls(
  request: NextRequest,
  user: Pick<SupabaseUser, 'id' | 'created_at'>
) {
  const ipAddress = extractIPFromHeaders(request.headers);
  const route = new URL(request.url).pathname;
  const decision = await resolveWebAbuseDecision({
    authKind: 'session',
    ipAddress,
    isRead: request.method === 'GET' || request.method === 'HEAD',
    method: request.method,
    request,
    route,
    userCreatedAt: user.created_at,
    userId: user.id,
  });
  let headers: Record<string, string> = {};
  const finalize = (response: NextResponse) => {
    for (const [name, value] of Object.entries(headers))
      response.headers.set(name, value);
    recordResponseAbuseSignal({
      decision,
      ipAddress,
      method: request.method,
      response,
      route,
      userId: user.id,
    });
    return response;
  };
  if (request.method === 'GET' || request.method === 'HEAD')
    return { response: null, headers, finalize };
  const { config } = getAdaptiveRateLimitConfig(
    { windowMs: 60_000, maxRequests: 60 },
    decision
  );
  const result = await checkRateLimit(`session:user:mutate:${user.id}`, config);
  if (!('allowed' in result)) {
    result.headers.set(
      'X-RateLimit-Policy',
      'web-calendar-session-user-mutate'
    );
    result.headers.set('X-RateLimit-Caller-Class', 'authenticated');
    result.headers.set('X-RateLimit-Window', 'minute');
    return { response: result, headers, finalize };
  }
  headers = result.headers;
  return { response: null, headers, finalize };
}
