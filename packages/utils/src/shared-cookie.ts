export interface TuturuuuSharedCookieDomain {
  cookieDomain: string;
  hostname: string;
  secure: boolean;
}

export type CookieOptionsLike = {
  domain?: string;
  expires?: Date;
  maxAge?: number;
  path?: string;
  sameSite?: boolean | 'lax' | 'none' | 'strict';
  secure?: boolean;
};

type HeaderReader =
  | Headers
  | Pick<Headers, 'get'>
  | Record<string, string | null | undefined>;

type CookieSource =
  | URL
  | string
  | {
      headers?: HeaderReader;
      url?: string;
    }
  | null
  | undefined;

export const TUTURUUU_SHARED_COOKIE_DOMAINS = [
  {
    cookieDomain: '.tuturuuu.com',
    hostname: 'tuturuuu.com',
    secure: true,
  },
  {
    cookieDomain: '.tuturuuu.localhost',
    hostname: 'tuturuuu.localhost',
    secure: false,
  },
] as const satisfies readonly TuturuuuSharedCookieDomain[];

export const TUTURUUU_SHARED_COOKIE_DOMAIN_ENV_KEY =
  'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN';

/**
 * Exact allowlist of environment-configured shared cookie domains. Anything
 * else (a sibling such as `.foo.tutur3u.com`, a registrable domain such as
 * `.tutur3u.com` or `.tuturuuu.com`, a lookalike on another zone) is ignored,
 * so a mis-set variable can never widen the cookie scope or move production off
 * `.tuturuuu.com`.
 */
export const CONFIGURED_SHARED_COOKIE_DOMAINS = [
  '.staging.tutur3u.com',
] as const;

/**
 * True on a Vercel production deployment. Server code reads `TUTURUUU_DEPLOY_ENV` for explicit staging admission and `VERCEL_ENV`;
 * browser bundles cannot see it (it is not `NEXT_PUBLIC_`-inlined), so they fall
 * back to `NEXT_PUBLIC_VERCEL_ENV` when it is exposed to the client.
 */
function isProductionDeployment() {
  return (
    process.env.VERCEL_ENV === 'production' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
  );
}

let productionOverrideErrorLogged = false;

/** Test-only: lets the once-per-process production error log fire again. */
export function resetProductionOverrideErrorLogForTests() {
  productionOverrideErrorLogged = false;
}

const warnedSharedCookieDomainValues = new Set<string>();

function warnIgnoredSharedCookieDomain(value: string, reason: string) {
  if (warnedSharedCookieDomainValues.has(value)) return;

  warnedSharedCookieDomainValues.add(value);
  console.warn(
    `[shared-cookie] Ignoring ${TUTURUUU_SHARED_COOKIE_DOMAIN_ENV_KEY} "${value}": ${reason}`
  );
}

/**
 * The accepted environment override, or `null` when the variable is unset or
 * not on the exact allowlist (in which case the production default applies).
 */
export function getConfiguredSharedCookieDomainOverride(): TuturuuuSharedCookieDomain | null {
  const normalized =
    process.env.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN?.trim().toLowerCase();
  if (
    process.env.TUTURUUU_DEPLOY_ENV === 'staging' &&
    (isProductionDeployment() || normalized !== '.staging.tutur3u.com')
  ) {
    throw new Error(
      'Staging requires the staging shared cookie domain and a non-production runtime'
    );
  }

  if (!normalized) return null;

  // Fail closed: a staging override that leaks onto production is ignored.
  if (isProductionDeployment()) {
    if (!productionOverrideErrorLogged) {
      productionOverrideErrorLogged = true;
      console.error(
        `[shared-cookie] Ignoring ${TUTURUUU_SHARED_COOKIE_DOMAIN_ENV_KEY} on a production deployment; it must never be set on production`
      );
    }
    return null;
  }

  const accepted = CONFIGURED_SHARED_COOKIE_DOMAINS.find(
    (domain) => domain === normalized
  );

  if (!accepted) {
    warnIgnoredSharedCookieDomain(
      normalized,
      `only ${CONFIGURED_SHARED_COOKIE_DOMAINS.join(', ')} is accepted`
    );
    return null;
  }

  if (process.env.TUTURUUU_DEPLOY_ENV !== 'staging') return null;

  return { cookieDomain: accepted, hostname: accepted.slice(1), secure: true };
}

/**
 * Shared cookie domains for this deployment. Production defaults to
 * `.tuturuuu.com`; the staging deployment sets
 * `NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN=.staging.tutur3u.com` (the only
 * accepted override), which replaces the production domain. The variable must
 * never be set on production. The first entry is the primary (managed) domain.
 */
export function getTuturuuuSharedCookieDomains(): readonly TuturuuuSharedCookieDomain[] {
  const configured = getConfiguredSharedCookieDomainOverride();

  return configured
    ? [configured, ...TUTURUUU_SHARED_COOKIE_DOMAINS.slice(1)]
    : TUTURUUU_SHARED_COOKIE_DOMAINS;
}

export function getTuturuuuPrimarySharedCookieDomain(): TuturuuuSharedCookieDomain {
  return getTuturuuuSharedCookieDomains()[0] as TuturuuuSharedCookieDomain;
}

const ENV_APP_URL_KEYS = [
  'PORTLESS_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_WEB_APP_URL',
  'WEB_APP_URL',
  'VERCEL_URL',
] as const;

function normalizeUrlLike(value: string | URL | null | undefined) {
  if (!value) return null;

  if (value instanceof URL) return value;

  try {
    return new URL(value);
  } catch {
    try {
      return new URL(`https://${value}`);
    } catch {
      return null;
    }
  }
}

function readHeader(headers: HeaderReader | undefined, name: string) {
  if (!headers) return null;

  if ('get' in headers && typeof headers.get === 'function') {
    return headers.get(name);
  }

  const lowerName = name.toLowerCase();
  const record = headers as Record<string, string | null | undefined>;

  return record[name] ?? record[lowerName] ?? null;
}

function extractForwardedValue(value: string | null | undefined) {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .find(Boolean);
}

function configuredAppUrl() {
  if (typeof window !== 'undefined' && window.location?.href) {
    return window.location.href;
  }

  for (const key of ENV_APP_URL_KEYS) {
    const value = process.env[key];
    if (value) return value;
  }

  return null;
}

function resolveUrlFromRequestLike(
  source: Extract<CookieSource, { headers?: HeaderReader; url?: string }>
) {
  const forwardedHost =
    extractForwardedValue(readHeader(source.headers, 'x-forwarded-host')) ??
    extractForwardedValue(readHeader(source.headers, 'host'));

  if (forwardedHost && !/[\r\n]/u.test(forwardedHost)) {
    const forwardedProto = extractForwardedValue(
      readHeader(source.headers, 'x-forwarded-proto')
    );
    const fallbackProtocol = normalizeUrlLike(source.url)?.protocol ?? 'https:';
    const protocol =
      forwardedProto?.replace(/:$/u, '') === 'http'
        ? 'http:'
        : fallbackProtocol === 'http:'
          ? 'http:'
          : 'https:';

    return normalizeUrlLike(`${protocol}//${forwardedHost}`);
  }

  return normalizeUrlLike(source.url);
}

function resolveCookieUrl(source: CookieSource) {
  if (!source) {
    return normalizeUrlLike(configuredAppUrl());
  }

  if (typeof source === 'string' || source instanceof URL) {
    return normalizeUrlLike(source);
  }

  return resolveUrlFromRequestLike(source);
}

function domainForUrl(url: string | URL | null | undefined) {
  const parsedUrl = normalizeUrlLike(url);
  const hostname = parsedUrl?.hostname.toLowerCase();

  if (!hostname) return null;

  return (
    getTuturuuuSharedCookieDomains().find(
      (entry) =>
        hostname === entry.hostname || hostname.endsWith(`.${entry.hostname}`)
    ) ?? null
  );
}

function isPortlessBackendUrl(sourceUrl: URL | null) {
  const portlessUrl = normalizeUrlLike(process.env.PORTLESS_URL);
  const expectedPort = process.env.PORT;

  if (!sourceUrl || !portlessUrl || !expectedPort) return false;
  if (!domainForUrl(portlessUrl)) return false;

  return (
    (sourceUrl.protocol === 'http:' || sourceUrl.protocol === 'https:') &&
    (sourceUrl.hostname === '127.0.0.1' ||
      sourceUrl.hostname === 'localhost') &&
    sourceUrl.port === expectedPort
  );
}

export function resolveTuturuuuSharedCookieDomain(source?: CookieSource) {
  const sourceUrl = resolveCookieUrl(source);
  const sourceDomain = domainForUrl(sourceUrl);

  if (sourceDomain) return sourceDomain;

  if (isPortlessBackendUrl(sourceUrl)) {
    return domainForUrl(process.env.PORTLESS_URL);
  }

  return null;
}

export function getTuturuuuSharedCookieOptions<
  TOptions extends CookieOptionsLike,
>(options: TOptions, source?: CookieSource): TOptions {
  const sharedDomain = resolveTuturuuuSharedCookieDomain(source);
  const nextOptions = {
    ...options,
    path: options.path ?? '/',
  };

  if (!sharedDomain) return nextOptions;

  return {
    ...nextOptions,
    domain: sharedDomain.cookieDomain,
    secure: sharedDomain.secure,
  };
}

export function getTuturuuuBrowserSharedCookieOptions<
  TOptions extends CookieOptionsLike,
>(options: TOptions): TOptions {
  return getTuturuuuSharedCookieOptions(options);
}

export function getHostOnlyCookieOptions<TOptions extends CookieOptionsLike>(
  options: TOptions
): TOptions {
  const { domain: _domain, ...hostOnlyOptions } = options;

  return {
    ...hostOnlyOptions,
    path: options.path ?? '/',
  } as TOptions;
}

export function getSharedAndHostOnlyCookieDeleteOptions<
  TOptions extends CookieOptionsLike,
>(options: TOptions, source?: CookieSource): TOptions[] {
  const hostOnlyOptions = getHostOnlyCookieOptions({
    ...options,
    maxAge: 0,
    path: options.path ?? '/',
  });
  const sharedOptions = getTuturuuuSharedCookieOptions(
    {
      ...options,
      maxAge: 0,
      path: options.path ?? '/',
    },
    source
  );

  if (!sharedOptions.domain) return [hostOnlyOptions];

  return [hostOnlyOptions, sharedOptions];
}
