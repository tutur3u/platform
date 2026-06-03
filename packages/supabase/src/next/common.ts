import type { CookieOptions, CookieOptionsWithName } from '@supabase/ssr';

export type SupabaseCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

const HOST_ONLY_COOKIE_CLEAR_DATE = 'Thu, 01 Jan 1970 00:00:00 GMT';
const SAFE_COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const SHARED_COOKIE_DOMAINS = [
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
] as const;

function normalizeUrlLike(value: string | URL | null | undefined) {
  if (!value) return null;

  if (value instanceof URL) {
    return value;
  }

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

function getConfiguredAppUrl() {
  if (typeof window !== 'undefined' && window.location?.href) {
    return window.location.href;
  }

  return (
    process.env.PORTLESS_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_WEB_APP_URL ??
    process.env.WEB_APP_URL ??
    process.env.VERCEL_URL ??
    null
  );
}

function resolveSharedCookieDomainForUrl(url: string | URL | null | undefined) {
  const parsedUrl = normalizeUrlLike(url);
  const hostname = parsedUrl?.hostname;

  if (!hostname) {
    return null;
  }

  return (
    SHARED_COOKIE_DOMAINS.find(
      (entry) =>
        hostname === entry.hostname || hostname.endsWith(`.${entry.hostname}`)
    ) ?? null
  );
}

function isPortlessBackendUrl(url: string | URL | null | undefined) {
  const parsedUrl = normalizeUrlLike(url);
  const portlessUrl = normalizeUrlLike(process.env.PORTLESS_URL);
  const expectedPort = process.env.PORT;

  if (!parsedUrl || !portlessUrl || !expectedPort) {
    return false;
  }

  if (!resolveSharedCookieDomainForUrl(portlessUrl)) {
    return false;
  }

  return (
    (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') &&
    (parsedUrl.hostname === '127.0.0.1' ||
      parsedUrl.hostname === 'localhost') &&
    parsedUrl.port === expectedPort
  );
}

function resolveSharedCookieDomain(url: string | URL | null | undefined) {
  const requestDomain = resolveSharedCookieDomainForUrl(url);

  if (requestDomain) {
    return requestDomain;
  }

  if (isPortlessBackendUrl(url)) {
    return resolveSharedCookieDomainForUrl(process.env.PORTLESS_URL);
  }

  if (!url) {
    return resolveSharedCookieDomainForUrl(getConfiguredAppUrl());
  }

  return null;
}

export function getSupabaseAuthStorageKey(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

function getSafeCookiePath(path: string | undefined) {
  return path && !/[;\r\n]/u.test(path) ? path : '/';
}

function isSafeCookieName(name: string) {
  return SAFE_COOKIE_NAME_PATTERN.test(name);
}

export function getHostOnlyCookieClearHeadersForNames(
  cookieNames: Iterable<string>,
  path = '/'
) {
  const seen = new Set<string>();
  const headers: string[] = [];
  const safePath = getSafeCookiePath(path);

  for (const name of cookieNames) {
    if (!isSafeCookieName(name)) {
      continue;
    }

    const key = `${name}\0${safePath}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    headers.push(
      `${name}=; Path=${safePath}; Expires=${HOST_ONLY_COOKIE_CLEAR_DATE}; Max-Age=0`
    );
  }

  return headers;
}

export function getHostOnlyCookieClearHeaders(cookiesToSet: SupabaseCookie[]) {
  const cookiesByPath = new Map<string, string[]>();

  for (const cookie of cookiesToSet) {
    if (!cookie.options.domain) {
      continue;
    }

    const path = getSafeCookiePath(cookie.options.path);
    cookiesByPath.set(path, [...(cookiesByPath.get(path) ?? []), cookie.name]);
  }

  return [...cookiesByPath].flatMap(([path, names]) =>
    getHostOnlyCookieClearHeadersForNames(names, path)
  );
}

export function getSupabaseCookieOptions(
  supabaseUrl: string,
  requestUrl?: string | URL | null
): CookieOptionsWithName {
  const sharedCookieDomain = resolveSharedCookieDomain(requestUrl);
  const options: CookieOptionsWithName = {
    name: getSupabaseAuthStorageKey(supabaseUrl),
    path: '/',
    sameSite: 'lax',
  };

  if (sharedCookieDomain) {
    options.domain = sharedCookieDomain.cookieDomain;
    options.secure = sharedCookieDomain.secure;
  }

  return options;
}

export function checkEnvVariables({
  useSecretKey = false,
}: {
  useSecretKey?: boolean;
}): {
  url: string;
  key: string;
} {
  const url =
    typeof window === 'undefined'
      ? (process.env.SUPABASE_SERVER_URL ??
        process.env.NEXT_PUBLIC_SUPABASE_URL)
      : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = useSecretKey
    ? process.env.SUPABASE_SECRET_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw Error('Missing Supabase URL');
  if (!key) throw Error(`Missing Supabase key`);

  return { url, key };
}
