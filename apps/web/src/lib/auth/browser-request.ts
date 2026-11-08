type HeadersLike =
  | Headers
  | Map<string, string>
  | Record<string, string | null>;

export const MOBILE_SESSION_BROWSER_REFUSED = 'MOBILE_SESSION_BROWSER_REFUSED';

// Browsers send Origin on every unsafe request and Fetch Metadata on every
// request to a secure origin; the native mobile and CLI clients send neither.
const BROWSER_REQUEST_HEADERS = [
  'origin',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
] as const;

function hasHeader(headers: HeadersLike, name: string) {
  if (headers instanceof Headers) {
    return headers.has(name);
  }

  if (headers instanceof Map) {
    for (const key of headers.keys()) {
      if (key.toLowerCase() === name) return true;
    }
    return false;
  }

  return Object.entries(headers).some(
    ([key, value]) => key.toLowerCase() === name && value !== null
  );
}

export function isBrowserRequest(headers: HeadersLike) {
  return BROWSER_REQUEST_HEADERS.some((name) => hasHeader(headers, name));
}

/**
 * Raw Supabase session tokens are only returned to native clients. A browser
 * page (including injected script on any tuturuuu.com app) must use the
 * cookie session instead, so it can never hold a refresh token.
 */
export function refuseMobileSessionForBrowser(endpoint: string) {
  console.warn('Refused mobile session tokens for a browser request', {
    code: MOBILE_SESSION_BROWSER_REFUSED,
    endpoint,
  });

  return {
    body: {
      code: MOBILE_SESSION_BROWSER_REFUSED,
      error: 'Mobile sessions are not available to browser requests',
    },
    status: 403,
  };
}
