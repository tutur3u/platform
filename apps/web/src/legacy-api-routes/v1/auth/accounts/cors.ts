import { getAllowedFirstPartyCorsOrigin } from '@tuturuuu/utils/first-party-cors';
import { NextResponse } from 'next/server';

const ACCOUNT_CORS_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const DEFAULT_ACCOUNT_CORS_HEADERS = 'Content-Type';

/**
 * The strict first-party allowlist: https only, the apex or one label below
 * it, default port, never the gateway origin host (and the staging domain the
 * same way on staging). Never an echo of any *.tuturuuu.com origin.
 */
function getAllowedOrigin(request: Request) {
  return getAllowedFirstPartyCorsOrigin(request.headers.get('origin'));
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
