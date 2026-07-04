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

export function resolveGoogleCalendarOAuthRedirectUri(request?: HeaderCarrier) {
  return (
    normalizeHttpUrl(process.env.GOOGLE_REDIRECT_URI) ||
    new URL(
      GOOGLE_CALENDAR_CALLBACK_PATH,
      resolveGoogleCalendarWebOrigin(request)
    ).toString()
  );
}

export function buildGoogleCalendarPostAuthRedirectUrl(
  request: HeaderCarrier | undefined,
  wsId: string
) {
  const redirectUrl = new URL(
    `/${encodeURIComponent(wsId)}/calendar`,
    resolveGoogleCalendarWebOrigin(request)
  );

  redirectUrl.searchParams.set('provider', 'google');
  redirectUrl.searchParams.set('connected', 'true');

  return redirectUrl;
}
