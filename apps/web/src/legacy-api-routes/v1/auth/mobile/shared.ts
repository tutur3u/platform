import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import { NextResponse } from 'next/server';

const exposedRateLimitHeaders = [
  'Retry-After',
  'X-RateLimit-Caller-Class',
  'X-RateLimit-Client-IP',
  'X-RateLimit-Policy',
].join(', ');

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Expose-Headers': exposedRateLimitHeaders,
  'Access-Control-Max-Age': '86400',
};

export type AuthRateLimitPolicy = 'otp-send' | 'otp-verify' | 'password-login';

function readPositiveInteger(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null;
}

export function buildAuthRateLimitDiagnosticHeaders({
  body,
  policy,
  request,
  status,
}: {
  body: Record<string, unknown>;
  policy: AuthRateLimitPolicy;
  request: Pick<Request, 'headers'>;
  status: number;
}) {
  if (status !== 429) {
    return {};
  }

  const headers: Record<string, string> = {
    'X-RateLimit-Caller-Class': 'anonymous',
    'X-RateLimit-Policy': policy,
  };

  const retryAfter = readPositiveInteger(body.retryAfter);
  if (retryAfter !== null) {
    headers['Retry-After'] = `${retryAfter}`;
  }

  const clientIp = extractIPFromHeaders(request.headers);
  if (clientIp && clientIp !== 'unknown') {
    headers['X-RateLimit-Client-IP'] = clientIp;
  }

  return headers;
}

export function jsonWithCors(
  body: Record<string, unknown>,
  init?: ResponseInit
) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

export function jsonWithAuthRateLimitDiagnostics(
  body: Record<string, unknown>,
  {
    policy,
    request,
    status,
  }: {
    policy: AuthRateLimitPolicy;
    request: Pick<Request, 'headers'>;
    status: number;
  }
) {
  return jsonWithCors(body, {
    status,
    headers: buildAuthRateLimitDiagnosticHeaders({
      body,
      policy,
      request,
      status,
    }),
  });
}

export function optionsWithCors() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}
