import { getAllowedFirstPartyCorsOrigin } from '@tuturuuu/utils/first-party-cors';
import {
  DEV_INTERNAL_APP_DOMAINS,
  PORTLESS_INTERNAL_APP_DOMAINS,
  PRODUCTION_INTERNAL_APP_DOMAINS,
} from '@tuturuuu/utils/internal-domains';
import { isOwnerOnlyInternalApp } from '@tuturuuu/utils/owner-only-apps';
import { getConfiguredSharedCookieDomainOverride } from '@tuturuuu/utils/shared-cookie';
import { isStagingAppOrigin } from '@tuturuuu/utils/staging-hosts';
import { NextResponse } from 'next/server';

const ACCOUNT_CORS_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const DEFAULT_ACCOUNT_CORS_HEADERS = 'Content-Type';

function getAllowedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return null;

  // A production-mode local E2E server still has a configured Portless origin.
  if (
    origin === process.env.PORTLESS_URL &&
    getAllowedFirstPartyCorsOrigin(origin, { development: true }) === origin &&
    new URL(origin).hostname.endsWith('.localhost')
  ) {
    return origin;
  }

  if (
    (process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test') &&
    (DEV_INTERNAL_APP_DOMAINS.some(({ url }) => url === origin) ||
      PORTLESS_INTERNAL_APP_DOMAINS.some(
        ({ url }) => `${url}:${process.env.PORTLESS_PORT ?? '1355'}` === origin
      ))
  ) {
    return origin;
  }

  if (getConfiguredSharedCookieDomainOverride()) {
    return isStagingAppOrigin(origin) ? origin : null;
  }

  return getAllowedFirstPartyCorsOrigin(origin, { development: false }) ===
    origin &&
    PRODUCTION_INTERNAL_APP_DOMAINS.some(
      ({ name, url }) => url === origin && !isOwnerOnlyInternalApp(name)
    )
    ? origin
    : null;
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

  appendVaryOrigin(response);
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
  return response;
}

export function accountCorsJson(
  request: Request,
  body: unknown,
  init?: ResponseInit
) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'private, no-store');
  return withAccountCors(request, response);
}

export function guardAccountMutation(request: Request) {
  if (!getAllowedOrigin(request)) {
    return accountCorsJson(
      request,
      { error: 'Request origin is not allowed' },
      { status: 403 }
    );
  }

  const mediaType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== 'application/json') {
    return accountCorsJson(
      request,
      { error: 'Content-Type must be application/json' },
      { status: 415 }
    );
  }

  return null;
}

export function accountCorsPreflight(request: Request) {
  return withAccountCors(request, new NextResponse(null, { status: 204 }));
}
