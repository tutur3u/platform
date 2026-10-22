import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function getSetCookieHeaders(headers: Headers) {
  const setCookies =
    'getSetCookie' in headers && typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [];

  if (setCookies?.length) {
    return setCookies;
  }

  const singleHeader = headers.get('set-cookie');
  return singleHeader ? splitCombinedSetCookieHeader(singleHeader) : [];
}

function splitCombinedSetCookieHeader(header: string) {
  return header
    .split(/,\s*(?=[A-Za-z0-9!#$%&'*+\-.^_`|~]+=)/u)
    .map((setCookie) => setCookie.trim())
    .filter(Boolean);
}

function parseCookieHeader(cookieHeader: string | null) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = part.trim().split('=');

    if (rawName) {
      cookies.set(rawName, rawValueParts.join('='));
    }
  }
  return cookies;
}

export function updateCookieHeaderFromSetCookies(
  cookieHeader: string | null,
  setCookieHeaders: string[]
) {
  const cookies = parseCookieHeader(cookieHeader);

  for (const setCookie of setCookieHeaders) {
    const [cookiePair, ...attributes] = setCookie.split(';');
    const [rawName, ...rawValueParts] = cookiePair?.trim().split('=') ?? [];

    if (!rawName) {
      continue;
    }

    const maxAgeAttribute = attributes.find((attribute) =>
      attribute.trim().toLowerCase().startsWith('max-age=')
    );
    const maxAge = maxAgeAttribute
      ? Number.parseInt(maxAgeAttribute.split('=')[1] ?? '', 10)
      : null;

    if (maxAge === 0 || rawValueParts.length === 0) {
      cookies.delete(rawName);
      continue;
    }

    cookies.set(rawName, rawValueParts.join('='));
  }
  return [...cookies.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

export function getRequestHeadersWithResponseCookies(
  req: NextRequest,
  response: NextResponse
) {
  const headers = new Headers(req.headers);
  const overrideHeaders = response.headers
    .get('x-middleware-override-headers')
    ?.split(',')
    .map((header) => header.trim())
    .filter(Boolean);

  for (const header of overrideHeaders ?? []) {
    const overrideValue = response.headers.get(
      `x-middleware-request-${header}`
    );

    if (overrideValue === null) {
      headers.delete(header);
    } else {
      headers.set(header, overrideValue);
    }
  }

  const setCookieHeaders = getSetCookieHeaders(response.headers);

  if (setCookieHeaders.length === 0) {
    return headers;
  }

  const nextCookieHeader = updateCookieHeaderFromSetCookies(
    headers.get('cookie'),
    setCookieHeaders
  );

  if (nextCookieHeader) {
    headers.set('cookie', nextCookieHeader);
  } else {
    headers.delete('cookie');
  }
  return headers;
}

export function copySetCookieHeaders(
  setCookieHeaders: string[],
  response: NextResponse
) {
  for (const setCookie of setCookieHeaders) {
    response.headers.append('set-cookie', setCookie);
  }
}

export function createNextResponseWithRequestHeaders(headers?: Headers) {
  return headers
    ? NextResponse.next({
        request: {
          headers,
        },
      })
    : NextResponse.next();
}
