/**
 * Default Tuturuuu API path (v2)
 */
export const DEFAULT_API_PATH = '/api/v2';

/**
 * Default Tuturuuu API endpoint (production v2)
 */
export const DEFAULT_TUTURUUU_API_ENDPOINT = 'https://tuturuuu.com/api/v2';

/**
 * Extracts the API base path from an endpoint URL.
 * @param endpoint - The full API endpoint URL (e.g., 'https://tuturuuu.com/api/v2')
 * @returns The path portion (e.g., '/api/v2')
 */
export function getApiBasePath(endpoint: string | undefined): string {
  if (!endpoint) return DEFAULT_API_PATH;
  try {
    return new URL(endpoint).pathname;
  } catch {
    return DEFAULT_API_PATH;
  }
}

/**
 * Options for building a Tuturuuu proxy URL
 */
interface ProxyUrlOptions {
  /** The path to request (relative to API base, e.g., '/workspaces/123') */
  path: string;
  /** Optional workspace ID for rate limiting */
  wsId?: string;
  /** Optional API endpoint override */
  apiEndpoint?: string;
  /** Optional query string (without leading ?) */
  queryString?: string;
}

/**
 * Builds a proxy URL for Tuturuuu API requests.
 * Routes requests through local proxy to avoid CORS issues.
 */
export function buildProxyUrl({
  path,
  wsId,
  apiEndpoint,
  queryString,
}: ProxyUrlOptions): string {
  const apiBasePath = getApiBasePath(apiEndpoint);
  const params = new URLSearchParams();

  // Normalize path - remove leading slash if present to avoid double slashes
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  params.set('path', `${apiBasePath}/${normalizedPath}`);

  if (wsId) params.set('wsId', wsId);
  if (apiEndpoint) params.set('apiUrl', apiEndpoint);

  let url = `/api/v1/proxy/tuturuuu?${params.toString()}`;

  // Append additional query string if provided
  if (queryString) {
    url += `&${queryString}`;
  }

  return url;
}

/**
 * Options for fetching from Tuturuuu API
 */
interface TuturuuuFetchOptions {
  /** The path to request (relative to API base) */
  path: string;
  /** API key for authentication */
  apiKey: string;
  /** Optional workspace ID for rate limiting */
  wsId?: string;
  /** Optional API endpoint override */
  apiEndpoint?: string;
  /** Optional query string (without leading ?) */
  queryString?: string;
}

/**
 * Fetches data from the Tuturuuu API through the local proxy.
 * Handles CORS by routing through /api/v1/proxy/tuturuuu.
 *
 * @returns The fetch Response object
 */
export async function fetchFromTuturuuu({
  path,
  apiKey,
  wsId,
  apiEndpoint,
  queryString,
}: TuturuuuFetchOptions): Promise<Response> {
  const url = buildProxyUrl({ path, wsId, apiEndpoint, queryString });

  return fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Tuturuuu-Api-Key': apiKey,
    },
  });
}

/**
 * Parses a URL and extracts the relative path (stripping the API base path).
 *
 * @param url - The URL to parse
 * @param apiEndpoint - The API endpoint to determine the base path
 * @returns Object containing relativePath and queryString
 */
export function parseUrlForProxy(
  url: string,
  apiEndpoint: string | undefined
): { relativePath: string; queryString: string } {
  const baseUrl = apiEndpoint || DEFAULT_TUTURUUU_API_ENDPOINT;

  try {
    const urlObj = new URL(url, baseUrl);
    const fullPath = urlObj.pathname;
    const queryString = urlObj.search ? urlObj.search.slice(1) : ''; // Remove leading ?

    // Strip the API base path to get relative path
    const apiBasePath = getApiBasePath(apiEndpoint);
    const relativePath = fullPath.startsWith(apiBasePath)
      ? fullPath.slice(apiBasePath.length)
      : fullPath;

    // Remove leading slash for consistency
    const normalizedPath = relativePath.startsWith('/')
      ? relativePath.slice(1)
      : relativePath;

    return { relativePath: normalizedPath, queryString };
  } catch {
    // If URL parsing fails, return the original as-is
    return { relativePath: url, queryString: '' };
  }
}
