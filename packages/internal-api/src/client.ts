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

export function encodePathSegment(value: string) {
  return encodeURIComponent(value);
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
  return (
    process.env.INTERNAL_WEB_API_ORIGIN ||
    process.env.NEXT_PUBLIC_WEB_APP_URL ||
    process.env.WEB_APP_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://tuturuuu.com'
      : 'http://localhost:7803')
  );
}

export function resolveInternalApiUrl(path: string, baseUrl?: string) {
  const normalizedPath = normalizePath(path);

  if (/^https?:\/\//.test(normalizedPath)) {
    return normalizedPath;
  }

  if (typeof window !== 'undefined') {
    return normalizedPath;
  }

  return new URL(normalizedPath, baseUrl || getConfiguredBaseUrl()).toString();
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

export const internalApiClient = createInternalApiClient();

export function getInternalApiClient(options?: InternalApiClientOptions) {
  return options ? createInternalApiClient(options) : internalApiClient;
}
