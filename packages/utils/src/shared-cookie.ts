import { isStagingSharedCookieDeployment } from '@tuturuuu/supabase/shared-cookie-domains';
import { resolveTrustedForwardedHostname } from './forwarded-host-trust';

export { resolveTrustedForwardedHostname } from './forwarded-host-trust';

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

function isProductionDeployment() {
  return (
    process.env.TUTURUUU_DEPLOY_ENV === 'production' ||
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
  const staging = isStagingSharedCookieDeployment(normalized);

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

  if (!staging) return null;

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
  // A client-supplied X-Forwarded-Host must not pick the cookie domain: only a
  // configured origin or a gateway-proven forwarded host is honoured.
  const rawForwardedHost = extractForwardedValue(
    readHeader(source.headers, 'x-forwarded-host')
  );
  const forwardedHost =
    rawForwardedHost &&
    resolveTrustedForwardedHostname(rawForwardedHost, source.headers)
      ? rawForwardedHost
      : null;
  const fallbackProtocol = normalizeUrlLike(source.url)?.protocol ?? 'https:';

  if (forwardedHost) {
    const forwardedProto = extractForwardedValue(
      readHeader(source.headers, 'x-forwarded-proto')
    );
    const protocol =
      forwardedProto?.replace(/:$/u, '') === 'http'
        ? 'http:'
        : fallbackProtocol === 'http:'
          ? 'http:'
          : 'https:';

    return normalizeUrlLike(`${protocol}//${forwardedHost}`);
  }

  const host = extractForwardedValue(readHeader(source.headers, 'host'));
  if (host && !/[\r\n]/u.test(host)) {
    return normalizeUrlLike(
      `${fallbackProtocol === 'http:' ? 'http:' : 'https:'}//${host}`
    );
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

/**
 * Global the Tuturuuu Start bridge writes into the document head with the
 * app's runtime base (`@tuturuuu/start-bridge/app-url`).
 */
const APP_BASE_GLOBAL = '__tuturuuuAppBase';

/** A mount base: one or more lowercase path segments, e.g. `/lms/learn`. */
const MOUNT_BASE = /^(?:\/[a-z0-9][a-z0-9-]*)+$/u;
/** A mounted build's chunk URL: `<base>/assets/<file>`. */
const MOUNTED_CHUNK = /^((?:\/[a-z0-9][a-z0-9-]*)+)\/assets\//u;

function chunkBase() {
  try {
    const chunk = new URL(import.meta.url);
    if (chunk.origin !== globalThis.location?.origin) return '';
    return MOUNTED_CHUNK.exec(chunk.pathname)?.[1] ?? '';
  } catch {
    return '';
  }
}

/**
 * In the browser, the base of an app mounted under a path of a shared origin
 * (`/tasks` on `tuturuuu.com/tasks`). It comes from the Start bridge head
 * global, or, when that script did not run, from this module's own chunk URL
 * (`/tasks/assets/...`), so a mounted document never falls back to the shared
 * cookie scope. Empty at a subdomain root, in apps without the bridge, and on
 * the server.
 */
export function browserMountedAppBase(): string {
  if (typeof document === 'undefined') return '';
  const value = (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL];
  const declared = typeof value === 'function' ? value() : value;
  if (typeof declared === 'string') {
    const base = declared.replace(/\/+$/u, '');
    if (MOUNT_BASE.test(base)) return base;
  }
  return chunkBase();
}

/**
 * Browser cookie options. At a root host the cookie is shared across
 * Tuturuuu subdomains; in a mounted app it is host-only at `Path=<base>`, so
 * it never reaches, shadows or clears another app's or Web's `Path=/` cookie
 * on the shared origin.
 */
export function getTuturuuuBrowserSharedCookieOptions<
  TOptions extends CookieOptionsLike,
>(options: TOptions): TOptions {
  const base = browserMountedAppBase();
  if (base) {
    const { domain: _domain, ...mountedOptions } = options;
    return { ...mountedOptions, path: base, secure: true } as TOptions;
  }
  return getTuturuuuSharedCookieOptions(options);
}

/**
 * Browser deletions matching {@link getTuturuuuBrowserSharedCookieOptions}:
 * the shared and host-only `Path=/` copies at a root host, and only the
 * app's own `Path=<base>` copy in a mounted app.
 */
export function getTuturuuuBrowserCookieDeleteOptions<
  TOptions extends CookieOptionsLike,
>(options: TOptions): TOptions[] {
  return browserMountedAppBase()
    ? [getTuturuuuBrowserSharedCookieOptions({ ...options, maxAge: 0 })]
    : getSharedAndHostOnlyCookieDeleteOptions(options);
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
