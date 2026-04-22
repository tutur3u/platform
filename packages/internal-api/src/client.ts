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

function getConfiguredBaseUrl() {
  return normalizeBaseUrl(
    resolveConfiguredOrigin(process.env.INTERNAL_WEB_API_ORIGIN) ||
      resolveConfiguredOrigin(process.env.WEB_APP_URL) ||
      resolveConfiguredOrigin(process.env.NEXT_PUBLIC_WEB_APP_URL) ||
      resolveConfiguredOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
      resolveConfiguredOrigin(process.env.COOLIFY_URL) ||
      resolveConfiguredOrigin(process.env.COOLIFY_FQDN) ||
      (isProductionDeployment()
        ? 'https://tuturuuu.com'
        : 'http://localhost:7803')
  );
}

export function resolveInternalApiUrl(path: string, baseUrl?: string) {
  const normalizedPath = normalizePath(path);

  if (/^https?:\/\//.test(normalizedPath)) {
    return normalizedPath;
  }

  const resolvedBaseUrl = baseUrl
    ? normalizeBaseUrl(baseUrl)
    : typeof window === 'undefined'
      ? getConfiguredBaseUrl()
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

export function createInternalApiClient(
  options: InternalApiClientOptions = {}
) {
  const fetchImpl = options.fetch || globalThis.fetch;

  const doFetch = (path: string, init: InternalApiFetchInit = {}) => {
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
        let message: string;

        try {
          const data = (await response.json()) as {
            error?: string;
            message?: string;
          };
          message = data.message || data.error || fallbackMessage;
        } catch {
          message = fallbackMessage;
        }

        throw new Error(message);
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
  const cookieHeader = requestHeaders.get('cookie');
  const authorizationHeader = requestHeaders.get('authorization');

  if (!cookieHeader && !authorizationHeader) {
    return options;
  }

  const allowedOrigins = new Set<string>();

  if (options.baseUrl) {
    const parsed = tryParseAbsoluteUrl(normalizeBaseUrl(options.baseUrl));
    if (parsed) {
      allowedOrigins.add(parsed.origin);
    }
  }

  const configuredBaseUrl = tryParseAbsoluteUrl(getConfiguredBaseUrl());
  if (configuredBaseUrl) {
    allowedOrigins.add(configuredBaseUrl.origin);
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
