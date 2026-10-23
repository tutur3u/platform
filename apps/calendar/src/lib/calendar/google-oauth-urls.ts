import { BASE_URL } from '@/constants/common';

const GOOGLE_CALENDAR_CALLBACK_PATH = '/api/v1/calendar/auth/callback';
const DEFAULT_WEB_ORIGIN = 'https://tuturuuu.com';

type HeaderCarrier = {
  headers: Pick<Headers, 'get'>;
};

function firstHeaderValue(value: string | null) {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .find(Boolean);
}

function trimTrailingSlashes(value: string) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

function withDefaultScheme(value: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//iu.test(value) ? value : `https://${value}`;
}

function isWildcardHostname(hostname: string) {
  return hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]';
}

function normalizeHttpOrigin(value: string | null | undefined) {
  const [firstValue] =
    value
      ?.split(/[,\n]/u)
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];

  if (!firstValue) {
    return null;
  }

  try {
    const url = new URL(withDefaultScheme(firstValue));

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    if (isWildcardHostname(url.hostname)) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function normalizeHttpUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    if (isWildcardHostname(url.hostname)) {
      return null;
    }

    return trimTrailingSlashes(url.toString());
  } catch {
    return null;
  }
}

function resolveForwardedOrigin(request?: HeaderCarrier) {
  if (!request) {
    return null;
  }

  const forwardedHost = firstHeaderValue(
    request.headers.get('x-forwarded-host')
  );

  if (!forwardedHost) {
    return null;
  }

  const forwardedProto = firstHeaderValue(
    request.headers.get('x-forwarded-proto')
  );
  const protocol =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : 'https';

  return normalizeHttpOrigin(`${protocol}://${forwardedHost}`);
}

export function resolveGoogleCalendarWebOrigin(request?: HeaderCarrier) {
  return (
    normalizeHttpOrigin(process.env.WEB_APP_URL) ||
    normalizeHttpOrigin(process.env.NEXT_PUBLIC_WEB_APP_URL) ||
    normalizeHttpOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeHttpOrigin(process.env.COOLIFY_URL) ||
    normalizeHttpOrigin(process.env.COOLIFY_FQDN) ||
    resolveForwardedOrigin(request) ||
    DEFAULT_WEB_ORIGIN
  );
}

/**
 * Google `redirect_uri` for the Calendar callback. A configured
 * `GOOGLE_REDIRECT_URI` wins. In production the fallback is the Calendar
 * app's trusted `BASE_URL` (the app that serves this callback); the
 * Web-origin and forwarded-header fallbacks apply only outside production,
 * for local proxies.
 */
export function resolveGoogleCalendarOAuthRedirectUri(
  request?: HeaderCarrier,
  baseUrl: string = BASE_URL
) {
  const configured = normalizeHttpUrl(process.env.GOOGLE_REDIRECT_URI);
  if (configured) return configured;

  const origin =
    process.env.NODE_ENV === 'production'
      ? baseUrl
      : resolveGoogleCalendarWebOrigin(request);

  return new URL(GOOGLE_CALENDAR_CALLBACK_PATH, origin).toString();
}
