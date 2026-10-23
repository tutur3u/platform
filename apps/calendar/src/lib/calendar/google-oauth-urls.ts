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

function resolveConfiguredWebOrigin() {
  return (
    normalizeHttpOrigin(process.env.WEB_APP_URL) ||
    normalizeHttpOrigin(process.env.NEXT_PUBLIC_WEB_APP_URL) ||
    normalizeHttpOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeHttpOrigin(process.env.COOLIFY_URL) ||
    normalizeHttpOrigin(process.env.COOLIFY_FQDN)
  );
}

/**
 * Canonical public Web origin for browser redirects. Only deployment
 * configuration is trusted here, never the request URL, Host or forwarded
 * headers, so a redirect can never be steered to another origin.
 */
export function resolveCalendarCanonicalWebOrigin() {
  return resolveConfiguredWebOrigin() || DEFAULT_WEB_ORIGIN;
}

/**
 * Web origin used to build the OAuth `redirect_uri` sent to Google. Google
 * only accepts registered redirect URIs, so a forwarded host fallback is
 * kept for local proxies; browser redirects use the canonical origin instead.
 */
export function resolveGoogleCalendarWebOrigin(request?: HeaderCarrier) {
  return (
    resolveConfiguredWebOrigin() ||
    resolveForwardedOrigin(request) ||
    DEFAULT_WEB_ORIGIN
  );
}

export function resolveGoogleCalendarOAuthRedirectUri(request?: HeaderCarrier) {
  return (
    normalizeHttpUrl(process.env.GOOGLE_REDIRECT_URI) ||
    new URL(
      GOOGLE_CALENDAR_CALLBACK_PATH,
      resolveGoogleCalendarWebOrigin(request)
    ).toString()
  );
}

/**
 * Build a post-OAuth browser redirect on the canonical Web origin. Without a
 * verified workspace the redirect falls back to the origin root.
 */
export function buildCalendarPostAuthRedirectUrl(
  wsId: string | null,
  searchParams: Record<string, string>
) {
  const redirectUrl = new URL(
    wsId ? `/${encodeURIComponent(wsId)}/calendar` : '/',
    resolveCalendarCanonicalWebOrigin()
  );

  for (const [key, value] of Object.entries(searchParams)) {
    redirectUrl.searchParams.set(key, value);
  }

  return redirectUrl;
}

export function buildGoogleCalendarPostAuthRedirectUrl(wsId: string) {
  return buildCalendarPostAuthRedirectUrl(wsId, {
    provider: 'google',
    connected: 'true',
  });
}
