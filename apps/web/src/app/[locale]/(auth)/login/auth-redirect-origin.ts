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
  preserveCurrentManagedOrigin?: boolean;
  request?: HeaderCarrier | null;
};

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

function isLocalTuturuuuHostname(hostname: string) {
  return (
    hostname === 'tuturuuu.localhost' ||
    hostname.endsWith('.tuturuuu.localhost')
  );
}

function resolveCurrentPortlessOrigin(
  currentOrigin: string | null | undefined
) {
  const origin = normalizeHttpOrigin(currentOrigin);

  if (!origin) {
    return null;
  }

  const url = new URL(origin);

  return url.port && isLocalTuturuuuHostname(url.hostname) ? origin : null;
}

function normalizePortlessPort(value: string | null | undefined) {
  const port = firstConfiguredValue(value);

  if (!port || !/^\d+$/u.test(port)) {
    return null;
  }

  const portNumber = Number(port);

  return portNumber > 0 && portNumber <= 65535 ? String(portNumber) : null;
}

function normalizeConfiguredPortlessOrigin(
  value: string | null | undefined,
  env: NodeJS.ProcessEnv
) {
  const configuredValue = firstConfiguredValue(value);

  if (!configuredValue) {
    return null;
  }

  try {
    const url = new URL(withDefaultScheme(configuredValue));

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    if (!isLocalTuturuuuHostname(url.hostname)) {
      return null;
    }

    const port = url.port || normalizePortlessPort(env.PORTLESS_PORT);

    if (port) {
      url.port = port;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function resolveConfiguredPortlessOrigin(env: NodeJS.ProcessEnv) {
  return (
    normalizeConfiguredPortlessOrigin(env.PORTLESS_URL, env) ||
    normalizeConfiguredPortlessOrigin(env.BASE_URL, env) ||
    normalizeConfiguredPortlessOrigin(env.WEB_APP_URL, env) ||
    normalizeConfiguredPortlessOrigin(env.NEXT_PUBLIC_WEB_APP_URL, env) ||
    normalizeConfiguredPortlessOrigin(env.NEXT_PUBLIC_APP_URL, env)
  );
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

function resolveCurrentPlatformOrigin(
  currentOrigin: string | null | undefined
) {
  const origin = normalizeHttpOrigin(currentOrigin);

  if (!origin) {
    return null;
  }

  const appDomain = getAppDomainByUrl(origin);

  return appDomain?.kind === 'internal' && appDomain.name === 'platform'
    ? new URL(appDomain.canonicalUrl).origin
    : null;
}

function resolveCurrentManagedPlatformOrigin(
  currentOrigin: string | null | undefined
) {
  const origin = normalizeHttpOrigin(currentOrigin);

  if (!origin) {
    return null;
  }

  const url = new URL(origin);

  if (
    url.hostname === 'tuturuuu.com' ||
    !url.hostname.endsWith('.tuturuuu.com')
  ) {
    return null;
  }

  const appDomain = getAppDomainByUrl(origin);

  if (appDomain?.kind === 'external') {
    return null;
  }

  if (appDomain?.kind === 'internal' && appDomain.name !== 'platform') {
    return null;
  }

  url.protocol = 'https:';
  url.port = '';

  return url.origin;
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
  preserveCurrentManagedOrigin = false,
}: AuthRedirectOriginOptions = {}) {
  return (
    resolveCurrentPortlessOrigin(currentOrigin) ||
    resolveConfiguredPortlessOrigin(env) ||
    (preserveCurrentManagedOrigin
      ? resolveCurrentManagedPlatformOrigin(currentOrigin)
      : null) ||
    resolveConfiguredWebOrigin(env) ||
    resolveCurrentPlatformOrigin(currentOrigin) ||
    (!isProduction ? normalizeHttpOrigin(currentOrigin) : null) ||
    (isProduction
      ? DEFAULT_PRODUCTION_AUTH_ORIGIN
      : resolveLocalhostFallback(env))
  );
}
