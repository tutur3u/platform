const LOCAL_E2E_AUTH_BYPASS_ENV = 'TUTURUUU_LOCAL_E2E_AUTH_BYPASS';

const LOCAL_WEB_ORIGINS = new Set([
  'http://127.0.0.1:7803',
  'http://localhost:7803',
  'https://tuturuuu.localhost',
]);

const LOCAL_REQUEST_WEB_ORIGINS = new Set([
  ...LOCAL_WEB_ORIGINS,
  'http://127.0.0.1',
  'http://localhost',
]);

const LOCAL_INTERNAL_WEB_ORIGINS = new Set([
  'http://0.0.0.0:7803',
  'http://web:7803',
  'http://web-blue:7803',
  'http://web-green:7803',
]);

const LOCAL_SUPABASE_ORIGINS = new Set([
  'http://127.0.0.1:8001',
  'http://host.docker.internal:8001',
  'http://localhost:8001',
]);

type LocalE2EAuthRequest = {
  headers: {
    get(name: string): string | null;
  };
  url: string;
};

function isEnabled(value?: string) {
  return /^(1|true|yes)$/iu.test(String(value ?? ''));
}

function getOrigin(value?: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getFirstHeaderValue(value: string | null) {
  const firstValue = value?.split(',')[0]?.trim();

  if (!firstValue || /[\r\n]/u.test(firstValue)) {
    return null;
  }

  return firstValue;
}

function getProtocol(value: string | null) {
  const protocol = getFirstHeaderValue(value)?.replace(/:$/u, '').toLowerCase();

  if (protocol === 'http' || protocol === 'https') {
    return protocol;
  }

  return null;
}

function getHostOrigin(
  host: string | null,
  protocol: string | null,
  fallbackOrigin: string | null
) {
  const normalizedHost = getFirstHeaderValue(host);

  if (!normalizedHost) {
    return null;
  }

  const normalizedProtocol =
    getProtocol(protocol) ??
    (fallbackOrigin
      ? new URL(fallbackOrigin).protocol.replace(':', '')
      : 'http');

  return getOrigin(`${normalizedProtocol}://${normalizedHost}`);
}

function isLocalWebOrigin(origin: string | null): origin is string {
  return origin !== null && LOCAL_WEB_ORIGINS.has(origin);
}

function isLocalRequestWebOrigin(origin: string | null): origin is string {
  return origin !== null && LOCAL_REQUEST_WEB_ORIGINS.has(origin);
}

function isLocalInternalWebOrigin(origin: string | null): origin is string {
  return origin !== null && LOCAL_INTERNAL_WEB_ORIGINS.has(origin);
}

function isAllowedRequestOrigin(origin: string | null): origin is string {
  return isLocalRequestWebOrigin(origin) || isLocalInternalWebOrigin(origin);
}

function isLocalSupabaseOrigin(origin: string | null): origin is string {
  return origin !== null && LOCAL_SUPABASE_ORIGINS.has(origin);
}

function isOptionalLocalUrlHeader(
  request: LocalE2EAuthRequest,
  headerName: string
) {
  const value = getFirstHeaderValue(request.headers.get(headerName));

  if (!value) {
    return true;
  }

  return isLocalRequestWebOrigin(getOrigin(value));
}

export function isLocalE2EAuthBypassEnabled(
  env: NodeJS.ProcessEnv = process.env
) {
  if (!isEnabled(env[LOCAL_E2E_AUTH_BYPASS_ENV])) {
    return false;
  }

  const webOrigin = getOrigin(env.BASE_URL);
  const publicSupabaseOrigin = getOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
  const serverSupabaseOrigin = getOrigin(
    env.SUPABASE_SERVER_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  );

  return (
    isLocalWebOrigin(webOrigin) &&
    isLocalSupabaseOrigin(publicSupabaseOrigin) &&
    isLocalSupabaseOrigin(serverSupabaseOrigin)
  );
}

export function isLocalE2EAuthRequestAllowed(
  request: LocalE2EAuthRequest,
  env: NodeJS.ProcessEnv = process.env
) {
  if (!isLocalE2EAuthBypassEnabled(env)) {
    return false;
  }

  const requestOrigin = getOrigin(request.url);

  const forwardedProto = request.headers.get('x-forwarded-proto');
  const hostOrigin = getHostOrigin(
    request.headers.get('host'),
    forwardedProto,
    requestOrigin
  );
  const forwardedHostOrigin = getHostOrigin(
    request.headers.get('x-forwarded-host'),
    forwardedProto,
    requestOrigin
  );

  const hasLocalPublicOrigin = [
    requestOrigin,
    hostOrigin,
    forwardedHostOrigin,
  ].some(isLocalRequestWebOrigin);

  return (
    hasLocalPublicOrigin &&
    (requestOrigin === null || isAllowedRequestOrigin(requestOrigin)) &&
    (hostOrigin === null || isAllowedRequestOrigin(hostOrigin)) &&
    (forwardedHostOrigin === null ||
      isAllowedRequestOrigin(forwardedHostOrigin)) &&
    isOptionalLocalUrlHeader(request, 'origin') &&
    isOptionalLocalUrlHeader(request, 'referer')
  );
}
