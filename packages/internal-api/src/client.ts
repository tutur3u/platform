export type InternalApiQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type InternalApiQuery = Record<string, InternalApiQueryValue>;

export type InternalApiFetchInit = Omit<RequestInit, 'headers'> & {
  baseUrl?: string;
  headers?: HeadersInit;
  query?: InternalApiQuery;
};

export type InternalApiClientOptions = {
  baseUrl?: string;
  defaultHeaders?: HeadersInit;
  fetch?: typeof fetch;
};

type HeaderAccessor = Pick<Headers, 'get'>;
const APP_SESSION_COOKIE_NAME = 'tuturuuu_app_session';
const SUPABASE_AUTH_COOKIE_PATTERN = /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i;
const KNOWN_CUSTOM_SATELLITE_HOSTS = new Set(['nova.ai.vn', 'rewise.me']);
const KNOWN_NON_PLATFORM_TUTURUUU_HOSTS = new Set([
  'apps.tuturuuu.com',
  'cms.tuturuuu.com',
  'calendar.tuturuuu.com',
  'chat.tuturuuu.com',
  'drive.tuturuuu.com',
  'mail.tuturuuu.com',
  'meet.tuturuuu.com',
  'qr.tuturuuu.com',
  'mira.tuturuuu.com',
  'tasks.tuturuuu.com',
  'finance.tuturuuu.com',
  'inventory.tuturuuu.com',
  'storefront.tuturuuu.com',
  'tanstack.tuturuuu.com',
  'track.tuturuuu.com',
  'learn.tuturuuu.com',
  'teach.tuturuuu.com',
  'pay.tuturuuu.com',
  'contacts.tuturuuu.com',
  'forms.tuturuuu.com',
  'hive.tuturuuu.com',
  'mind.tuturuuu.com',
]);
const KNOWN_NON_PLATFORM_LOCALHOST_PORTS = new Set([
  '7804',
  '7805',
  '7806',
  '7807',
  '7808',
  '7809',
  '7810',
  '7811',
  '7812',
  '7813',
  '7814',
  '7815',
  '7816',
  '7817',
  '7818',
  '7819',
  '7820',
  '7821',
  '7822',
  '7824',
  '7826',
  '7827',
  '7828',
]);

export class InternalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'InternalApiError';
  }
}

function tryParseAbsoluteUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function resolveConfiguredOrigin(value?: string): string | null {
  if (!value) {
    return null;
  }

  const [firstValue] = value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!firstValue) {
    return null;
  }

  const normalized = /^[a-z]+:\/\//iu.test(firstValue)
    ? firstValue
    : `https://${firstValue}`;

  return tryParseAbsoluteUrl(normalized)?.origin ?? null;
}

function isKnownNonPlatformSatelliteOrigin(origin: string) {
  const url = tryParseAbsoluteUrl(origin);

  if (!url) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();

  if (KNOWN_CUSTOM_SATELLITE_HOSTS.has(hostname)) {
    return true;
  }

  if (KNOWN_NON_PLATFORM_TUTURUUU_HOSTS.has(hostname)) {
    return true;
  }

  if (hostname.endsWith('.tuturuuu.localhost')) {
    return true;
  }

  if (
    ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname) &&
    KNOWN_NON_PLATFORM_LOCALHOST_PORTS.has(url.port)
  ) {
    return true;
  }

  return false;
}

function resolveNextPublicAppUrlAsWebOrigin() {
  const origin = resolveConfiguredOrigin(process.env.NEXT_PUBLIC_APP_URL);

  if (!origin || isKnownNonPlatformSatelliteOrigin(origin)) {
    return null;
  }

  return origin;
}

export function encodePathSegment(value: string) {
  return encodeURIComponent(value);
}

function normalizeBaseUrl(baseUrl: string) {
  let end = baseUrl.length;

  while (end > 0 && baseUrl.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === baseUrl.length ? baseUrl : baseUrl.slice(0, end);
}

function isProductionDeployment() {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === 'production';
  }

  return process.env.NODE_ENV === 'production';
}
function normalizePath(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return path.startsWith('/') ? path : `/${path}`;
}

function appendQuery(path: string, query?: InternalApiQuery): string {
  if (!query || Object.keys(query).length === 0) {
    return path;
  }

  const normalizedPath = normalizePath(path);
  const isAbsoluteUrl = /^https?:\/\//.test(normalizedPath);
  const url = isAbsoluteUrl
    ? new URL(normalizedPath)
    : new URL(normalizedPath, 'http://internal-api.local');

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return isAbsoluteUrl ? url.toString() : `${url.pathname}${url.search}`;
}

export function getConfiguredInternalApiBaseUrl() {
  return normalizeBaseUrl(
    resolveConfiguredOrigin(process.env.INTERNAL_WEB_API_ORIGIN) ||
      resolveConfiguredOrigin(process.env.WEB_APP_URL) ||
      resolveConfiguredOrigin(process.env.NEXT_PUBLIC_WEB_APP_URL) ||
      resolveNextPublicAppUrlAsWebOrigin() ||
      resolveConfiguredOrigin(process.env.COOLIFY_URL) ||
      resolveConfiguredOrigin(process.env.COOLIFY_FQDN) ||
      (isProductionDeployment()
        ? 'https://tuturuuu.com'
        : 'https://tuturuuu.localhost')
  );
}

function isTasksBrowserRuntime() {
  const runtimeLocation =
    typeof globalThis === 'object' && 'location' in globalThis
      ? (globalThis.location as { hostname?: string } | undefined)
      : undefined;

  const hostname = runtimeLocation?.hostname?.toLowerCase();
  return (
    hostname === 'tasks.tuturuuu.com' || hostname === 'tasks.tuturuuu.localhost'
  );
}

function isMailAppRuntime() {
  if (typeof process === 'undefined') {
    return false;
  }

  const packageName = process.env.npm_package_name;
  if (packageName === '@tuturuuu/mail') {
    return true;
  }

  try {
    return process.cwd().replace(/\\/gu, '/').endsWith('/apps/mail');
  } catch {
    return false;
  }
}

export function getConfiguredTasksApiBaseUrl() {
  return normalizeBaseUrl(
    resolveConfiguredOrigin(process.env.TASKS_APP_URL) ||
      resolveConfiguredOrigin(process.env.NEXT_PUBLIC_TASKS_APP_URL) ||
      resolveConfiguredOrigin(process.env.TUTURUUU_TASKS_BASE_URL) ||
      resolveConfiguredOrigin(process.env.TUDO_APP_URL) ||
      resolveConfiguredOrigin(process.env.NEXT_PUBLIC_TUDO_APP_URL) ||
      (isProductionDeployment()
        ? 'https://tasks.tuturuuu.com'
        : 'https://tasks.tuturuuu.localhost')
  );
}

export function withTaskApiBaseUrl(
  options: InternalApiClientOptions = {}
): InternalApiClientOptions {
  if (options.baseUrl || isTasksBrowserRuntime()) {
    return options;
  }

  return {
    ...options,
    baseUrl: getConfiguredTasksApiBaseUrl(),
  };
}

export function getConfiguredMailApiBaseUrl() {
  return normalizeBaseUrl(
    resolveConfiguredOrigin(process.env.MAIL_APP_URL) ||
      resolveConfiguredOrigin(process.env.NEXT_PUBLIC_MAIL_APP_URL) ||
      resolveConfiguredOrigin(process.env.TUTURUUU_MAIL_BASE_URL) ||
      (isProductionDeployment()
        ? 'https://mail.tuturuuu.com'
        : 'https://mail.tuturuuu.localhost')
  );
}

export function withMailApiBaseUrl(
  options: InternalApiClientOptions = {}
): InternalApiClientOptions {
  if (options.baseUrl || isMailAppRuntime()) {
    return options;
  }

  return {
    ...options,
    baseUrl: getConfiguredMailApiBaseUrl(),
  };
}

function isCurrentBrowserHostname(...hostnames: string[]) {
  const runtimeLocation =
    typeof globalThis === 'object' && 'location' in globalThis
      ? (globalThis.location as { hostname?: string } | undefined)
      : undefined;

  const hostname = runtimeLocation?.hostname?.toLowerCase();
  return hostname !== undefined && hostnames.includes(hostname);
}

function isCurrentAppServerRuntime(packageName: string, appDir: string) {
  if (typeof process === 'undefined') {
    return false;
  }

  if (process.env.npm_package_name === packageName) {
    return true;
  }

  try {
    return process.cwd().replace(/\\/gu, '/').endsWith(appDir);
  } catch {
    return false;
  }
}

function isLearnAppRuntime() {
  return (
    isCurrentBrowserHostname(
      'learn.tuturuuu.com',
      'learn.tuturuuu.localhost'
    ) || isCurrentAppServerRuntime('@tuturuuu/learn', '/apps/learn')
  );
}

function isTeachAppRuntime() {
  return (
    isCurrentBrowserHostname(
      'teach.tuturuuu.com',
      'teach.tuturuuu.localhost'
    ) || isCurrentAppServerRuntime('@tuturuuu/teach', '/apps/teach')
  );
}

export function getConfiguredLearnApiBaseUrl() {
  return normalizeBaseUrl(
    resolveConfiguredOrigin(process.env.LEARN_APP_URL) ||
      resolveConfiguredOrigin(process.env.NEXT_PUBLIC_LEARN_APP_URL) ||
      resolveConfiguredOrigin(process.env.TUTURUUU_LEARN_BASE_URL) ||
      (isProductionDeployment()
        ? 'https://learn.tuturuuu.com'
        : 'https://learn.tuturuuu.localhost')
  );
}

export function withLearnApiBaseUrl(
  options: InternalApiClientOptions = {}
): InternalApiClientOptions {
  if (options.baseUrl || isLearnAppRuntime()) {
    return options;
  }

  return {
    ...options,
    baseUrl: getConfiguredLearnApiBaseUrl(),
  };
}

export function getConfiguredTeachApiBaseUrl() {
  return normalizeBaseUrl(
    resolveConfiguredOrigin(process.env.TEACH_APP_URL) ||
      resolveConfiguredOrigin(process.env.NEXT_PUBLIC_TEACH_APP_URL) ||
      resolveConfiguredOrigin(process.env.TUTURUUU_TEACH_BASE_URL) ||
      (isProductionDeployment()
        ? 'https://teach.tuturuuu.com'
        : 'https://teach.tuturuuu.localhost')
  );
}

export function withTeachApiBaseUrl(
  options: InternalApiClientOptions = {}
): InternalApiClientOptions {
  if (options.baseUrl || isTeachAppRuntime()) {
    return options;
  }

  return {
    ...options,
    baseUrl: getConfiguredTeachApiBaseUrl(),
  };
}

function isPayAppRuntime() {
  return (
    isCurrentBrowserHostname('pay.tuturuuu.com', 'pay.tuturuuu.localhost') ||
    isCurrentAppServerRuntime('@tuturuuu/pay', '/apps/pay')
  );
}

export function getConfiguredPayApiBaseUrl() {
  return normalizeBaseUrl(
    resolveConfiguredOrigin(process.env.PAY_APP_URL) ||
      resolveConfiguredOrigin(process.env.NEXT_PUBLIC_PAY_APP_URL) ||
      resolveConfiguredOrigin(process.env.TUTURUUU_PAY_BASE_URL) ||
      (isProductionDeployment()
        ? 'https://pay.tuturuuu.com'
        : 'https://pay.tuturuuu.localhost')
  );
}

export function withPayApiBaseUrl(
  options: InternalApiClientOptions = {}
): InternalApiClientOptions {
  if (options.baseUrl || isPayAppRuntime()) {
    return options;
  }

  return {
    ...options,
    baseUrl: getConfiguredPayApiBaseUrl(),
  };
}

function isContactsAppRuntime() {
  return (
    isCurrentBrowserHostname(
      'contacts.tuturuuu.com',
      'contacts.tuturuuu.localhost'
    ) || isCurrentAppServerRuntime('@tuturuuu/contacts', '/apps/contacts')
  );
}

export function getConfiguredContactsApiBaseUrl() {
  return normalizeBaseUrl(
    resolveConfiguredOrigin(process.env.CONTACTS_APP_URL) ||
      resolveConfiguredOrigin(process.env.NEXT_PUBLIC_CONTACTS_APP_URL) ||
      resolveConfiguredOrigin(process.env.TUTURUUU_CONTACTS_BASE_URL) ||
      (isProductionDeployment()
        ? 'https://contacts.tuturuuu.com'
        : 'https://contacts.tuturuuu.localhost')
  );
}

export function withContactsApiBaseUrl(
  options: InternalApiClientOptions = {}
): InternalApiClientOptions {
  if (options.baseUrl || isContactsAppRuntime()) {
    return options;
  }

  return {
    ...options,
    baseUrl: getConfiguredContactsApiBaseUrl(),
  };
}

/**
 * `/api/v1/tulearn/bootstrap` is owned by apps/learn but is also consumed by
 * apps/teach. Pin the call to the CALLING app's own origin so its app-session
 * audience (learn or teach) matches — never cross-pin teach → learn (learn's
 * proxy would reject a teach-audience session).
 */
export function withEducationBootstrapBaseUrl(
  options: InternalApiClientOptions = {}
): InternalApiClientOptions {
  if (options.baseUrl) {
    return options;
  }

  if (isTeachAppRuntime()) {
    return {
      ...options,
      baseUrl: getConfiguredTeachApiBaseUrl(),
    };
  }

  return {
    ...options,
    baseUrl: getConfiguredLearnApiBaseUrl(),
  };
}

function isFinanceBrowserRuntime() {
  return isCurrentBrowserHostname(
    'finance.tuturuuu.com',
    'finance.tuturuuu.localhost'
  );
}

export function getConfiguredFinanceApiBaseUrl() {
  return normalizeBaseUrl(
    resolveConfiguredOrigin(process.env.FINANCE_APP_URL) ||
      resolveConfiguredOrigin(process.env.NEXT_PUBLIC_FINANCE_APP_URL) ||
      resolveConfiguredOrigin(process.env.TUTURUUU_FINANCE_BASE_URL) ||
      (isProductionDeployment()
        ? 'https://finance.tuturuuu.com'
        : 'https://finance.tuturuuu.localhost')
  );
}

export function withFinanceApiBaseUrl(
  options: InternalApiClientOptions = {}
): InternalApiClientOptions {
  if (options.baseUrl || isFinanceBrowserRuntime()) {
    return options;
  }

  return {
    ...options,
    baseUrl: getConfiguredFinanceApiBaseUrl(),
  };
}

export function resolveInternalApiUrl(path: string, baseUrl?: string) {
  const normalizedPath = normalizePath(path);

  if (/^https?:\/\//.test(normalizedPath)) {
    return normalizedPath;
  }

  const resolvedBaseUrl = baseUrl
    ? normalizeBaseUrl(baseUrl)
    : typeof window === 'undefined'
      ? getConfiguredInternalApiBaseUrl()
      : undefined;

  if (!resolvedBaseUrl) {
    return normalizedPath;
  }

  return new URL(normalizedPath, resolvedBaseUrl).toString();
}

function mergeHeaders(
  defaultHeaders?: HeadersInit,
  requestHeaders?: HeadersInit
): Headers {
  const headers = new Headers(defaultHeaders);

  if (requestHeaders) {
    const nextHeaders = new Headers(requestHeaders);
    nextHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  return headers;
}

function getCookieName(cookiePart: string) {
  return cookiePart.trim().split('=')[0]?.trim() ?? '';
}

function hasAppSessionCookie(cookieHeader: string) {
  return cookieHeader
    .split(';')
    .some((part) => getCookieName(part) === APP_SESSION_COOKIE_NAME);
}

function getSupabaseAuthStorageKey(url: string) {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

function getConfiguredSupabaseAuthStorageKeys() {
  return [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVER_URL,
    process.env.SUPABASE_URL,
  ]
    .flatMap((url) => {
      if (!url) {
        return [];
      }

      try {
        return [getSupabaseAuthStorageKey(url)];
      } catch {
        return [];
      }
    })
    .filter((value, index, values) => values.indexOf(value) === index);
}

function isSupabaseAuthCookieChunkForStorageKey(
  cookieName: string,
  storageKey: string
) {
  if (cookieName === storageKey) {
    return true;
  }

  if (!cookieName.startsWith(`${storageKey}.`)) {
    return false;
  }

  return /^\d+$/u.test(cookieName.slice(storageKey.length + 1));
}

function isSharedSupabaseCookieHostname(hostname: string) {
  return (
    hostname === 'tuturuuu.com' ||
    hostname.endsWith('.tuturuuu.com') ||
    hostname === 'tuturuuu.localhost' ||
    hostname.endsWith('.tuturuuu.localhost')
  );
}

function shouldPreserveSupabaseAuthCookie(
  cookieName: string,
  targetOrigin: string | null
) {
  if (!targetOrigin) {
    return false;
  }

  const targetUrl = tryParseAbsoluteUrl(targetOrigin);
  if (!targetUrl || !isSharedSupabaseCookieHostname(targetUrl.hostname)) {
    return false;
  }

  return getConfiguredSupabaseAuthStorageKeys().some((storageKey) =>
    isSupabaseAuthCookieChunkForStorageKey(cookieName, storageKey)
  );
}

function sanitizeForwardedCookieHeader(
  cookieHeader: string | null,
  targetOrigin: string | null
) {
  if (!cookieHeader || !hasAppSessionCookie(cookieHeader)) {
    return cookieHeader;
  }

  const cookies = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const cookieName = getCookieName(part);
      return (
        !SUPABASE_AUTH_COOKIE_PATTERN.test(cookieName) ||
        shouldPreserveSupabaseAuthCookie(cookieName, targetOrigin)
      );
    });

  return cookies.length > 0 ? cookies.join('; ') : null;
}

export function createInternalApiClient(
  options: InternalApiClientOptions = {}
) {
  const doFetch = (path: string, init: InternalApiFetchInit = {}) => {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const { baseUrl, headers: requestHeaders, query, ...requestInit } = init;
    const requestPath = appendQuery(path, query);
    const url = resolveInternalApiUrl(requestPath, baseUrl || options.baseUrl);
    const headers = mergeHeaders(options.defaultHeaders, requestHeaders);

    return fetchImpl(url, {
      ...requestInit,
      headers,
    });
  };

  return {
    fetch: doFetch,

    async json<T>(path: string, init: InternalApiFetchInit = {}): Promise<T> {
      const response = await doFetch(path, init);

      if (!response.ok) {
        const fallbackMessage = `Internal API request failed: ${response.status}`;
        let code: string | undefined;
        let message: string;

        try {
          const data = (await response.json()) as {
            code?: string;
            error?: string;
            message?: string;
          };
          code = data.code;
          const challenge = response.headers?.get?.('x-abuse-challenge');

          if (data.code === 'ABUSE_CHALLENGE_REQUIRED' || challenge) {
            message = [
              data.message ||
                'Additional verification is required before retrying.',
              'This API request needs a browser verification challenge that the CLI cannot complete automatically.',
              'Open Tuturuuu in a browser to complete verification, then retry the CLI command.',
            ].join(' ');
          } else {
            message = data.message || data.error || fallbackMessage;
          }
        } catch {
          message = fallbackMessage;
        }

        throw new InternalApiError(message, response.status, code);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    },
  };
}

/**
 * Creates Internal API client options that forward auth-relevant headers
 * from an incoming request context (for example `next/headers()` in RSC).
 */
export function withForwardedInternalApiAuth(
  requestHeaders: HeaderAccessor,
  options: InternalApiClientOptions = {}
): InternalApiClientOptions {
  const authorizationHeader = requestHeaders.get('authorization');

  const allowedOrigins = new Set<string>();

  if (options.baseUrl) {
    const parsed = tryParseAbsoluteUrl(normalizeBaseUrl(options.baseUrl));
    if (parsed) {
      allowedOrigins.add(parsed.origin);
    }
  }

  const configuredBaseUrl = tryParseAbsoluteUrl(
    getConfiguredInternalApiBaseUrl()
  );
  if (configuredBaseUrl) {
    allowedOrigins.add(configuredBaseUrl.origin);
  }

  const configuredTasksBaseUrl = tryParseAbsoluteUrl(
    getConfiguredTasksApiBaseUrl()
  );
  if (configuredTasksBaseUrl) {
    allowedOrigins.add(configuredTasksBaseUrl.origin);
  }

  const configuredMailBaseUrl = tryParseAbsoluteUrl(
    getConfiguredMailApiBaseUrl()
  );
  if (configuredMailBaseUrl) {
    allowedOrigins.add(configuredMailBaseUrl.origin);
  }

  const configuredLearnBaseUrl = tryParseAbsoluteUrl(
    getConfiguredLearnApiBaseUrl()
  );
  if (configuredLearnBaseUrl) {
    allowedOrigins.add(configuredLearnBaseUrl.origin);
  }

  const configuredTeachBaseUrl = tryParseAbsoluteUrl(
    getConfiguredTeachApiBaseUrl()
  );
  if (configuredTeachBaseUrl) {
    allowedOrigins.add(configuredTeachBaseUrl.origin);
  }

  const configuredFinanceBaseUrl = tryParseAbsoluteUrl(
    getConfiguredFinanceApiBaseUrl()
  );
  if (configuredFinanceBaseUrl) {
    allowedOrigins.add(configuredFinanceBaseUrl.origin);
  }

  const configuredPayBaseUrl = tryParseAbsoluteUrl(
    getConfiguredPayApiBaseUrl()
  );
  if (configuredPayBaseUrl) {
    allowedOrigins.add(configuredPayBaseUrl.origin);
  }

  const configuredContactsBaseUrl = tryParseAbsoluteUrl(
    getConfiguredContactsApiBaseUrl()
  );
  if (configuredContactsBaseUrl) {
    allowedOrigins.add(configuredContactsBaseUrl.origin);
  }

  const targetOrigin =
    (options.baseUrl
      ? tryParseAbsoluteUrl(normalizeBaseUrl(options.baseUrl))?.origin
      : null) ??
    configuredBaseUrl?.origin ??
    null;
  const cookieHeader = sanitizeForwardedCookieHeader(
    requestHeaders.get('cookie'),
    targetOrigin
  );

  if (!cookieHeader && !authorizationHeader) {
    return options;
  }

  const runtimeLocation =
    typeof globalThis === 'object' && 'location' in globalThis
      ? (globalThis.location as { origin?: string } | undefined)
      : undefined;

  if (runtimeLocation?.origin) {
    allowedOrigins.add(runtimeLocation.origin);
  }

  const baseFetch = options.fetch || globalThis.fetch;

  const forwardedFetch: typeof fetch = async (input, init) => {
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const isRelativeRequest =
      typeof requestUrl === 'string' && requestUrl.startsWith('/');
    const parsedRequestUrl = isRelativeRequest
      ? null
      : tryParseAbsoluteUrl(requestUrl);
    const shouldForwardAuth =
      isRelativeRequest ||
      (parsedRequestUrl ? allowedOrigins.has(parsedRequestUrl.origin) : false);

    if (!shouldForwardAuth) {
      return baseFetch(input, init);
    }

    const headers = new Headers(
      input instanceof Request ? input.headers : undefined
    );

    if (init?.headers) {
      const initHeaders = new Headers(init.headers);
      initHeaders.forEach((value, key) => {
        headers.set(key, value);
      });
    }

    if (cookieHeader && !headers.has('cookie')) {
      headers.set('cookie', cookieHeader);
    }

    if (authorizationHeader && !headers.has('authorization')) {
      headers.set('authorization', authorizationHeader);
    }

    return baseFetch(input, {
      ...init,
      headers,
    });
  };

  return {
    ...options,
    fetch: forwardedFetch,
  };
}

export const internalApiClient = createInternalApiClient();

export function getInternalApiClient(options?: InternalApiClientOptions) {
  return options ? createInternalApiClient(options) : internalApiClient;
}
