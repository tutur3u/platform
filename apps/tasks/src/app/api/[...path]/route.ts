import {
  clearSupabaseAuthCookies,
  isSupabaseAuthCookieName,
} from '@tuturuuu/auth/app-session';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;
const WEB_APP_URL = resolveInternalAppUrl({
  appName: 'platform',
  candidates: [
    process.env.TTR_URL,
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ],
  fallback:
    process.env.NODE_ENV === 'production'
      ? 'https://tuturuuu.com'
      : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`),
});

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const FILTERED_RESPONSE_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  'content-encoding',
  'set-cookie',
]);

function getCookieName(cookiePart: string) {
  return cookiePart.trim().split('=')[0]?.trim() ?? '';
}

export function sanitizeTasksApiProxyCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isSupabaseAuthCookieName(getCookieName(part)));

  return cookies.length > 0 ? cookies.join('; ') : null;
}

function createForwardedRequestHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  const sanitizedCookieHeader = sanitizeTasksApiProxyCookieHeader(
    request.headers.get('cookie')
  );

  if (sanitizedCookieHeader) {
    headers.set('cookie', sanitizedCookieHeader);
  } else {
    headers.delete('cookie');
  }

  headers.set('x-forwarded-host', request.headers.get('host') ?? '');
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(/:$/u, ''));

  return headers;
}

function createForwardedResponseHeaders(headers: Headers) {
  const forwardedHeaders = new Headers();

  headers.forEach((value, key) => {
    if (!FILTERED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      forwardedHeaders.set(key, value);
    }
  });

  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;
  const setCookies =
    typeof getSetCookie === 'function'
      ? getSetCookie.call(headers)
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];

  for (const cookie of setCookies) {
    if (!isSupabaseAuthCookieName(getCookieName(cookie))) {
      forwardedHeaders.append('set-cookie', cookie);
    }
  }

  return forwardedHeaders;
}

async function proxyToWebApi(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  const targetUrl = new URL(
    `/api/${path.map((segment) => encodeURIComponent(segment)).join('/')}`,
    WEB_APP_URL
  );
  targetUrl.search = request.nextUrl.search;

  const init: RequestInit & { duplex?: 'half' } = {
    cache: 'no-store',
    headers: createForwardedRequestHeaders(request),
    method: request.method,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    init.body = request.body;
    init.duplex = 'half';
  }

  const upstreamResponse = await fetch(targetUrl, init);
  const response = new NextResponse(upstreamResponse.body, {
    headers: createForwardedResponseHeaders(upstreamResponse.headers),
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });

  return clearSupabaseAuthCookies(request, response);
}

export const GET = proxyToWebApi;
export const POST = proxyToWebApi;
export const PUT = proxyToWebApi;
export const PATCH = proxyToWebApi;
export const DELETE = proxyToWebApi;
export const HEAD = proxyToWebApi;
