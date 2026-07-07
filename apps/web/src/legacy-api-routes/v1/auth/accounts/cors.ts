import { resolveTuturuuuSharedCookieDomain } from '@tuturuuu/utils/shared-cookie';
import { NextResponse } from 'next/server';

const ACCOUNT_CORS_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const DEFAULT_ACCOUNT_CORS_HEADERS = 'Content-Type';

function getAllowedOrigin(request: Request) {
  const origin = request.headers.get('origin');

  if (!origin || !resolveTuturuuuSharedCookieDomain(origin)) {
    return null;
  }

  return origin;
}

function appendVaryOrigin(response: NextResponse) {
  const vary = response.headers.get('Vary');

  if (!vary) {
    response.headers.set('Vary', 'Origin');
    return;
  }

  if (
    !vary.split(',').some((entry) => entry.trim().toLowerCase() === 'origin')
  ) {
    response.headers.set('Vary', `${vary}, Origin`);
  }
}

export function withAccountCors<TResponse extends NextResponse>(
  request: Request,
  response: TResponse
): TResponse {
  const origin = getAllowedOrigin(request);

  if (!origin) return response;

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', ACCOUNT_CORS_METHODS);
  response.headers.set(
    'Access-Control-Allow-Headers',
    request.headers.get('access-control-request-headers') ??
      DEFAULT_ACCOUNT_CORS_HEADERS
  );
  response.headers.set('Access-Control-Max-Age', '86400');
  appendVaryOrigin(response);

  return response;
}

export function accountCorsJson(
  request: Request,
  body: unknown,
  init?: ResponseInit
) {
  return withAccountCors(request, NextResponse.json(body, init));
}

export function accountCorsPreflight(request: Request) {
  return withAccountCors(request, new NextResponse(null, { status: 204 }));
}
