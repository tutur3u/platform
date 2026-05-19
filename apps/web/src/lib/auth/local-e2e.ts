const LOCAL_E2E_AUTH_BYPASS_ENV = 'TUTURUUU_LOCAL_E2E_AUTH_BYPASS';

const LOCAL_WEB_ORIGINS = new Set([
  'http://127.0.0.1:7803',
  'http://localhost:7803',
  'https://tuturuuu.localhost',
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
  fallbackOrigin: string
) {
  const normalizedHost = getFirstHeaderValue(host);

  if (!normalizedHost) {
    return null;
  }

  const normalizedProtocol =
    getProtocol(protocol) ?? new URL(fallbackOrigin).protocol.replace(':', '');

  return getOrigin(`${normalizedProtocol}://${normalizedHost}`);
}

function isLocalWebOrigin(origin: string | null): origin is string {
  return origin !== null && LOCAL_WEB_ORIGINS.has(origin);
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

  return isLocalWebOrigin(getOrigin(value));
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

  if (!isLocalWebOrigin(requestOrigin)) {
    return false;
  }

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

  return (
    (hostOrigin === null || isLocalWebOrigin(hostOrigin)) &&
    (forwardedHostOrigin === null || isLocalWebOrigin(forwardedHostOrigin)) &&
    isOptionalLocalUrlHeader(request, 'origin') &&
    isOptionalLocalUrlHeader(request, 'referer')
  );
}
