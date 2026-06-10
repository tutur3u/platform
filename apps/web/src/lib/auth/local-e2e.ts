const LOCAL_E2E_AUTH_BYPASS_ENV = 'TUTURUUU_LOCAL_E2E_AUTH_BYPASS';
const NEXT_PUBLIC_ENV_PREFIX = 'NEXT_PUBLIC';
const LOCAL_E2E_DEFAULT_SUPABASE_URL = 'http://127.0.0.1:8001';
const LOCAL_E2E_PORTLESS_ORIGIN = 'https://tuturuuu.localhost:1355';

const LOCAL_WEB_ORIGINS = new Set([
  'http://127.0.0.1:7803',
  'http://localhost:7803',
  'https://tuturuuu.localhost',
  LOCAL_E2E_PORTLESS_ORIGIN,
]);

const LOCAL_REQUEST_WEB_ORIGINS = new Set([
  ...LOCAL_WEB_ORIGINS,
  'http://127.0.0.1',
  'http://localhost',
  'http://tuturuuu.localhost',
  'http://tuturuuu.localhost:1355',
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

function getRuntimePublicEnvValue(name: string, env: NodeJS.ProcessEnv) {
  return env[`${NEXT_PUBLIC_ENV_PREFIX}_${name}`];
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

function isLocalPortlessBackendOrigin(
  origin: string | null,
  env: NodeJS.ProcessEnv
): origin is string {
  const portlessOrigin = getOrigin(env.PORTLESS_URL);

  if (!isLocalWebOrigin(portlessOrigin)) {
    return false;
  }

  const expectedPort = env.PORT;
  if (!expectedPort) {
    return false;
  }

  try {
    const url = new URL(origin ?? '');

    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      url.port === expectedPort
    );
  } catch {
    return false;
  }
}

function isLocalRequestWebOrigin(origin: string | null): origin is string {
  return origin !== null && LOCAL_REQUEST_WEB_ORIGINS.has(origin);
}

function isLocalInternalWebOrigin(origin: string | null): origin is string {
  return origin !== null && LOCAL_INTERNAL_WEB_ORIGINS.has(origin);
}

function isAllowedRequestOrigin(
  origin: string | null,
  env: NodeJS.ProcessEnv
): origin is string {
  return (
    isLocalRequestWebOrigin(origin) ||
    isLocalInternalWebOrigin(origin) ||
    isLocalPortlessBackendOrigin(origin, env)
  );
}

function isLocalSupabaseOrigin(origin: string | null): origin is string {
  return origin !== null && LOCAL_SUPABASE_ORIGINS.has(origin);
}

function getLocalE2EBypassFlag(env: NodeJS.ProcessEnv) {
  return (
    env[LOCAL_E2E_AUTH_BYPASS_ENV] ??
    getRuntimePublicEnvValue('TUTURUUU_LOCAL_E2E_AUTH_BYPASS', env) ??
    getRuntimePublicEnvValue('TUTURUUU_LOCAL_E2E_AUTH_BYPASS', process.env)
  );
}

function getConfiguredUrl(...values: (string | undefined)[]) {
  return values.find((value) => value?.trim());
}

function hasLocalE2EWebOrigin(env: NodeJS.ProcessEnv) {
  return [
    env.BASE_URL ?? null,
    env.PORTLESS_URL,
    getRuntimePublicEnvValue('APP_URL', env),
    getRuntimePublicEnvValue('WEB_APP_URL', env),
    getRuntimePublicEnvValue('APP_URL', process.env),
    getRuntimePublicEnvValue('WEB_APP_URL', process.env),
  ].some((url) => isLocalWebOrigin(getOrigin(url ?? undefined)));
}

export function getLocalE2EPublicSupabaseUrl(
  env: NodeJS.ProcessEnv = process.env
): string {
  const serverSupabaseUrl = getConfiguredUrl(
    env.SUPABASE_SERVER_URL,
    env.SUPABASE_URL
  );

  if (
    isEnabled(getLocalE2EBypassFlag(env)) &&
    isLocalSupabaseOrigin(getOrigin(serverSupabaseUrl))
  ) {
    return LOCAL_E2E_DEFAULT_SUPABASE_URL;
  }

  return (
    getConfiguredUrl(
      getRuntimePublicEnvValue('SUPABASE_URL', env),
      getRuntimePublicEnvValue('SUPABASE_URL', process.env)
    ) ?? LOCAL_E2E_DEFAULT_SUPABASE_URL
  );
}

export function getLocalE2ESupabaseBrowserConfig(
  env: NodeJS.ProcessEnv = process.env
) {
  if (!isLocalE2EAuthBypassEnabled(env)) {
    return null;
  }

  const supabasePublishableKey = getConfiguredUrl(
    getRuntimePublicEnvValue('SUPABASE_PUBLISHABLE_KEY', env),
    getRuntimePublicEnvValue('SUPABASE_PUBLISHABLE_KEY', process.env)
  );

  if (!supabasePublishableKey) {
    return null;
  }

  return {
    supabasePublishableKey,
    supabaseUrl: getLocalE2EPublicSupabaseUrl(env),
  };
}

function getLocalE2EServerSupabaseUrl(env: NodeJS.ProcessEnv) {
  return (
    getConfiguredUrl(env.SUPABASE_SERVER_URL, env.SUPABASE_URL) ??
    getLocalE2EPublicSupabaseUrl(env)
  );
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
  if (!isEnabled(getLocalE2EBypassFlag(env))) {
    return false;
  }

  const publicSupabaseOrigin = getOrigin(getLocalE2EPublicSupabaseUrl(env));
  const serverSupabaseOrigin = getOrigin(getLocalE2EServerSupabaseUrl(env));

  return (
    hasLocalE2EWebOrigin(env) &&
    isLocalSupabaseOrigin(publicSupabaseOrigin) &&
    isLocalSupabaseOrigin(serverSupabaseOrigin)
  );
}

export function shouldBypassSupabaseAuthCaptchaForDev(
  env: NodeJS.ProcessEnv = process.env
) {
  if (isLocalE2EAuthBypassEnabled(env)) {
    return true;
  }

  if (env.NODE_ENV !== 'development') {
    return false;
  }

  const publicSupabaseOrigin = getOrigin(getLocalE2EPublicSupabaseUrl(env));
  const serverSupabaseOrigin = getOrigin(getLocalE2EServerSupabaseUrl(env));

  return (
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
    getOrigin(env.PORTLESS_URL),
  ].some(isLocalRequestWebOrigin);

  return (
    hasLocalPublicOrigin &&
    (requestOrigin === null || isAllowedRequestOrigin(requestOrigin, env)) &&
    (hostOrigin === null || isAllowedRequestOrigin(hostOrigin, env)) &&
    (forwardedHostOrigin === null ||
      isAllowedRequestOrigin(forwardedHostOrigin, env)) &&
    isOptionalLocalUrlHeader(request, 'origin') &&
    isOptionalLocalUrlHeader(request, 'referer')
  );
}
