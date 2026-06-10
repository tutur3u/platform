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
const OPTIONAL_AUTH_COOKIE_URL_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVER_URL',
  'SUPABASE_URL',
] as const;
const NEXT_PUBLIC_ENV_PREFIX = 'NEXT_PUBLIC';
const LOCAL_E2E_DEFAULT_SUPABASE_URL = 'http://127.0.0.1:8001';
type HostOnlyCookieClearHeaderOptions = Pick<
  CookieOptions,
  'path' | 'sameSite' | 'secure'
>;
type HostOnlyCookieClearHeaderInput = string | HostOnlyCookieClearHeaderOptions;

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

function getRuntimePublicEnvValue(name: string) {
  return process.env[`${NEXT_PUBLIC_ENV_PREFIX}_${name}`];
}

function isEnabled(value?: string) {
  return /^(1|true|yes)$/iu.test(String(value ?? ''));
}

function isLocalSupabaseUrl(value: string | URL | null | undefined) {
  const parsedUrl = normalizeUrlLike(value);

  return (
    parsedUrl?.protocol === 'http:' &&
    parsedUrl.port === '8001' &&
    (parsedUrl.hostname === '127.0.0.1' ||
      parsedUrl.hostname === 'localhost' ||
      parsedUrl.hostname === 'host.docker.internal')
  );
}

function getLocalE2ECookieNameUrl() {
  if (!isEnabled(process.env.TUTURUUU_LOCAL_E2E_AUTH_BYPASS)) {
    return null;
  }

  const serverUrl = process.env.SUPABASE_SERVER_URL ?? process.env.SUPABASE_URL;

  return isLocalSupabaseUrl(serverUrl) ? LOCAL_E2E_DEFAULT_SUPABASE_URL : null;
}

function getConfiguredAppUrl() {
  if (typeof window !== 'undefined' && window.location?.href) {
    return window.location.href;
  }

  return (
    process.env.PORTLESS_URL ??
    getRuntimePublicEnvValue('APP_URL') ??
    getRuntimePublicEnvValue('WEB_APP_URL') ??
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

function getSupabaseCookieNameUrl(supabaseUrl: string) {
  const localE2ESupabaseUrl = getLocalE2ECookieNameUrl();

  if (localE2ESupabaseUrl) {
    return localE2ESupabaseUrl;
  }

  const publicSupabaseUrl = getRuntimePublicEnvValue('SUPABASE_URL');

  if (publicSupabaseUrl && normalizeUrlLike(publicSupabaseUrl)) {
    return publicSupabaseUrl;
  }

  return supabaseUrl;
}

export function getSupabaseAuthCookieUrls(supabaseUrl: string) {
  const urls = [
    getSupabaseCookieNameUrl(supabaseUrl),
    supabaseUrl,
    ...OPTIONAL_AUTH_COOKIE_URL_ENV_KEYS.map((key) =>
      key.startsWith(`${NEXT_PUBLIC_ENV_PREFIX}_`)
        ? getRuntimePublicEnvValue(key.slice(NEXT_PUBLIC_ENV_PREFIX.length + 1))
        : process.env[key]
    ),
  ];
  const seenStorageKeys = new Set<string>();
  const authCookieUrls: string[] = [];

  for (const url of urls) {
    if (!url) {
      continue;
    }

    try {
      const storageKey = getSupabaseAuthStorageKey(url);

      if (seenStorageKeys.has(storageKey)) {
        continue;
      }

      seenStorageKeys.add(storageKey);
      authCookieUrls.push(url);
    } catch {
      // Ignore invalid optional URLs. The primary Supabase URL is validated by
      // checkEnvVariables before this helper is used in auth code.
    }
  }

  return authCookieUrls;
}

function getSafeCookiePath(path: string | undefined) {
  return path && !/[;\r\n]/u.test(path) ? path : '/';
}

function isSafeCookieName(name: string) {
  return SAFE_COOKIE_NAME_PATTERN.test(name);
}

function formatSameSiteCookieAttribute(
  sameSite: HostOnlyCookieClearHeaderOptions['sameSite']
) {
  if (typeof sameSite !== 'string') {
    return null;
  }

  switch (sameSite.toLowerCase()) {
    case 'lax':
      return 'Lax';
    case 'strict':
      return 'Strict';
    case 'none':
      return 'None';
    default:
      return null;
  }
}

function getHostOnlyCookieClearAttributes(
  optionsOrPath: HostOnlyCookieClearHeaderInput
) {
  if (typeof optionsOrPath === 'string') {
    return {
      path: getSafeCookiePath(optionsOrPath),
      sameSite: null,
      secure: false,
    };
  }

  return {
    path: getSafeCookiePath(optionsOrPath.path),
    sameSite: formatSameSiteCookieAttribute(optionsOrPath.sameSite),
    secure: optionsOrPath.secure === true,
  };
}

export function getHostOnlyCookieClearHeadersForNames(
  cookieNames: Iterable<string>,
  optionsOrPath: HostOnlyCookieClearHeaderInput = '/'
) {
  const seen = new Set<string>();
  const headers: string[] = [];
  const attributes = getHostOnlyCookieClearAttributes(optionsOrPath);

  for (const name of cookieNames) {
    if (!isSafeCookieName(name)) {
      continue;
    }

    const key = [
      name,
      attributes.path,
      attributes.sameSite ?? '',
      attributes.secure ? 'secure' : '',
    ].join('\0');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const cookieAttributes = [
      `Path=${attributes.path}`,
      `Expires=${HOST_ONLY_COOKIE_CLEAR_DATE}`,
      'Max-Age=0',
    ];

    if (attributes.sameSite) {
      cookieAttributes.push(`SameSite=${attributes.sameSite}`);
    }

    if (attributes.secure) {
      cookieAttributes.push('Secure');
    }

    headers.push(`${name}=; ${cookieAttributes.join('; ')}`);
  }

  return headers;
}

export function getHostOnlyCookieClearHeaders(cookiesToSet: SupabaseCookie[]) {
  const headers = new Set<string>();

  for (const cookie of cookiesToSet) {
    if (!cookie.options.domain) {
      continue;
    }

    for (const header of getHostOnlyCookieClearHeadersForNames(
      [cookie.name],
      cookie.options
    )) {
      headers.add(header);
    }
  }

  return [...headers];
}

export function getSupabaseCookieOptions(
  supabaseUrl: string,
  requestUrl?: string | URL | null
): CookieOptionsWithName {
  const sharedCookieDomain = resolveSharedCookieDomain(requestUrl);
  const options: CookieOptionsWithName = {
    name: getSupabaseAuthStorageKey(getSupabaseCookieNameUrl(supabaseUrl)),
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
        getRuntimePublicEnvValue('SUPABASE_URL'))
      : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = useSecretKey
    ? process.env.SUPABASE_SECRET_KEY
    : typeof window === 'undefined'
      ? getRuntimePublicEnvValue('SUPABASE_PUBLISHABLE_KEY')
      : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw Error('Missing Supabase URL');
  if (!key) throw Error(`Missing Supabase key`);

  return { url, key };
}
