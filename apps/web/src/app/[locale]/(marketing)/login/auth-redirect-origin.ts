import { getAppDomainByUrl } from '@tuturuuu/utils/internal-domains';

const DEFAULT_PRODUCTION_AUTH_ORIGIN = 'https://tuturuuu.com';
const DEFAULT_LOCAL_AUTH_PORT = '7803';

type HeaderCarrier = {
  headers: Pick<Headers, 'get'>;
};

type AuthRedirectOriginOptions = {
  currentOrigin?: string | null;
  env?: NodeJS.ProcessEnv;
  isProduction?: boolean;
  request?: HeaderCarrier | null;
};

function firstHeaderValue(value: string | null) {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .find(Boolean);
}

function firstConfiguredValue(value: string | null | undefined) {
  return value
    ?.split(/[,\n]/u)
    .map((entry) => entry.trim())
    .find(Boolean);
}

function withDefaultScheme(value: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//iu.test(value) ? value : `https://${value}`;
}

export function isWildcardAuthRedirectHostname(hostname: string) {
  return hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]';
}

function normalizeHttpOrigin(value: string | null | undefined) {
  const configuredValue = firstConfiguredValue(value);

  if (!configuredValue) {
    return null;
  }

  try {
    const url = new URL(withDefaultScheme(configuredValue));

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    if (isWildcardAuthRedirectHostname(url.hostname)) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function normalizeConfiguredWebOrigin(value: string | null | undefined) {
  const origin = normalizeHttpOrigin(value);

  if (!origin) {
    return null;
  }

  const appDomain = getAppDomainByUrl(origin);

  if (appDomain?.kind === 'internal' && appDomain.name !== 'platform') {
    return null;
  }

  return appDomain?.kind === 'internal'
    ? new URL(appDomain.canonicalUrl).origin
    : origin;
}

function resolveConfiguredWebOrigin(env: NodeJS.ProcessEnv) {
  return (
    normalizeConfiguredWebOrigin(env.WEB_APP_URL) ||
    normalizeConfiguredWebOrigin(env.NEXT_PUBLIC_WEB_APP_URL) ||
    normalizeConfiguredWebOrigin(env.NEXT_PUBLIC_APP_URL) ||
    normalizeConfiguredWebOrigin(env.COOLIFY_URL) ||
    normalizeConfiguredWebOrigin(env.COOLIFY_FQDN)
  );
}

function resolveForwardedOrigin(request: HeaderCarrier | null | undefined) {
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

function resolveLocalhostFallback(env: NodeJS.ProcessEnv) {
  const port = /^\d+$/u.test(env.PORT ?? '')
    ? env.PORT
    : DEFAULT_LOCAL_AUTH_PORT;

  return `http://localhost:${port}`;
}

export function resolveAuthRedirectOrigin({
  currentOrigin,
  env = process.env,
  isProduction = env.NODE_ENV === 'production',
  request,
}: AuthRedirectOriginOptions = {}) {
  return (
    resolveConfiguredWebOrigin(env) ||
    resolveForwardedOrigin(request) ||
    normalizeHttpOrigin(currentOrigin) ||
    (isProduction
      ? DEFAULT_PRODUCTION_AUTH_ORIGIN
      : resolveLocalhostFallback(env))
  );
}
