'use client';

/**
 * Global fetch interceptor for transparent 429 (rate limit) retry.
 *
 * When an idempotent **same-origin** fetch call receives a 429 response, this interceptor:
 * 1. Shows a debounced toast notification to the user
 * 2. Waits for the duration specified in the `Retry-After` header
 * 3. Retries the request (up to 3 times)
 * 4. Returns the eventual response to the caller transparently
 *
 * External / cross-origin requests are passed through untouched so that
 * CDN images, third-party APIs, etc. are never interfered with.
 *
 * Non-idempotent requests still show the user-facing 429 toast, but are never
 * retried so one user action does not consume multiple server-side attempts.
 *
 * i18n: Call `setRateLimitMessage(fn)` from a React component inside
 * `NextIntlClientProvider` to provide translated messages. The interceptor
 * installs at module scope (before React renders) with an English fallback.
 */

import { toast } from '@tuturuuu/ui/sonner';

const MAX_RETRIES = 3;
const RATE_LIMIT_TOAST_ID = 'global-rate-limit-toast';
const SENSITIVE_QUERY_PARAM_NAMES = new Set([
  'access',
  'access_token',
  'api_key',
  'code',
  'email',
  'key',
  'otp',
  'password',
  'refresh',
  'refresh_token',
  'secret',
  'session',
  'signature',
  'token',
]);

export type RateLimitDebugDetails = {
  capturedAt: string;
  headers: Record<string, string>;
  maxRetries: number;
  method: string;
  pagePath: string;
  requestPath: string;
  retryAfterSeconds: number;
  retryAttempt: number;
  status: number;
  timezone: string;
  userAgent: string;
  willRetry: boolean;
};

type RateLimitDetailsHandler = (details: RateLimitDebugDetails) => void;

/** Formats the rate-limit toast message. Overridden by `setRateLimitMessage`. */
let formatMessage = (seconds: number): string =>
  `You're being rate limited. Retrying in ${seconds}s…`;
let viewDetailsLabel = 'View details';
let detailsHandler: RateLimitDetailsHandler | null = null;
let lastRateLimitDetails: RateLimitDebugDetails | null = null;

/**
 * Replaces the default English message with a translated formatter.
 * Call this from a React component that has access to `useTranslations`.
 */
export function setRateLimitMessage(fn: (seconds: number) => string) {
  formatMessage = fn;
}

export function setRateLimitToastLabels(labels: { viewDetails: string }) {
  viewDetailsLabel = labels.viewDetails;
}

export function setRateLimitDetailsHandler(
  handler: RateLimitDetailsHandler | null
) {
  detailsHandler = handler;
}

let rateLimitToastActive = false;

function openRateLimitDetails(details: RateLimitDebugDetails) {
  if (detailsHandler) {
    detailsHandler(details);
    return;
  }

  window.dispatchEvent(
    new CustomEvent('tuturuuu:rate-limit-details', { detail: details })
  );
}

function notifyRateLimit(retryAfter: number, details: RateLimitDebugDetails) {
  lastRateLimitDetails = details;
  if (rateLimitToastActive) return;
  rateLimitToastActive = true;
  toast.warning(formatMessage(retryAfter), {
    action: {
      label: viewDetailsLabel,
      onClick: () => {
        if (lastRateLimitDetails) {
          openRateLimitDetails(lastRateLimitDetails);
        }
      },
    },
    duration: Math.min(Math.max((retryAfter + 1) * 1000, 10_000), 60_000),
    id: RATE_LIMIT_TOAST_ID,
    onDismiss: () => {
      rateLimitToastActive = false;
    },
    onAutoClose: () => {
      rateLimitToastActive = false;
    },
  });
}

function getRetryAfterSeconds(response: Response) {
  const parsed = Number.parseInt(
    response.headers.get('Retry-After') || '5',
    10
  );
  return Math.min(Number.isFinite(parsed) && parsed > 0 ? parsed : 5, 60);
}

/** Returns true for same-origin or relative URLs (our own API). */
function isSameOrigin(input: RequestInfo | URL): boolean {
  try {
    if (typeof input === 'string') {
      // Relative URLs (e.g. "/api/v1/...") are always same-origin
      if (input.startsWith('/')) return true;
      return new URL(input).origin === window.location.origin;
    }
    if (input instanceof URL) {
      return input.origin === window.location.origin;
    }
    // Request object
    if (input instanceof Request) {
      return new URL(input.url).origin === window.location.origin;
    }
  } catch {
    // Malformed URL — treat as same-origin to be safe
  }
  return true;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) {
    return init.method.toUpperCase();
  }

  if (input instanceof Request) {
    return input.method.toUpperCase();
  }

  return 'GET';
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  if (input instanceof Request) {
    return input.url;
  }

  return String(input);
}

function shouldRedactQueryParam(name: string) {
  const normalized = name.toLowerCase();
  return (
    SENSITIVE_QUERY_PARAM_NAMES.has(normalized) ||
    normalized.endsWith('_token') ||
    normalized.endsWith('-token') ||
    normalized.includes('secret') ||
    normalized.includes('password')
  );
}

function sanitizePath(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (url.origin !== window.location.origin) {
      return '[cross-origin]';
    }

    const sanitizedSearchParams = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      sanitizedSearchParams.append(
        key,
        shouldRedactQueryParam(key) ? '[redacted]' : value
      );
    });

    const search = sanitizedSearchParams
      .toString()
      .replaceAll('%5Bredacted%5D', '[redacted]');
    return `${url.pathname}${search ? `?${search}` : ''}`;
  } catch {
    return '[unavailable]';
  }
}

function readSelectedHeaders(headers: Headers): Record<string, string> {
  const selectedHeaderNames = [
    'Retry-After',
    'X-Proxy-Block-Reason',
    'X-RateLimit-Policy',
    'X-RateLimit-Window',
    'X-RateLimit-Caller-Class',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-Id',
    'X-Vercel-Id',
    'CF-Ray',
  ];
  const selected: Record<string, string> = {};

  for (const headerName of selectedHeaderNames) {
    const value = headers.get(headerName);
    if (value) {
      selected[headerName] = value;
    }
  }

  return selected;
}

function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  } catch {
    return 'unknown';
  }
}

function buildRateLimitDebugDetails({
  input,
  init,
  response,
  retryAfterSeconds,
  retryAttempt,
  willRetry,
}: {
  input: RequestInfo | URL;
  init?: RequestInit;
  response: Response;
  retryAfterSeconds: number;
  retryAttempt: number;
  willRetry: boolean;
}): RateLimitDebugDetails {
  const pageUrl = `${window.location.pathname}${window.location.search}`;

  return {
    capturedAt: new Date().toISOString(),
    headers: readSelectedHeaders(response.headers),
    maxRetries: MAX_RETRIES,
    method: getRequestMethod(input, init),
    pagePath: sanitizePath(pageUrl),
    requestPath: sanitizePath(getRequestUrl(input)),
    retryAfterSeconds,
    retryAttempt,
    status: response.status,
    timezone: getTimezone(),
    userAgent: window.navigator.userAgent,
    willRetry,
  };
}

function shouldRetryRateLimitedRequest(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const method = getRequestMethod(input, init);
  return method === 'GET' || method === 'HEAD';
}

let installed = false;

/**
 * Installs the global fetch interceptor. Safe to call multiple times
 * (only installs once). Must be called from client-side code only.
 */
export function installFetchInterceptor() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const response = await originalFetch(input, init);

    // Only handle same-origin rate limits — never interfere with external
    // resources. Mutations show diagnostics but are not retried.
    if (!isSameOrigin(input) || response.status !== 429) {
      return response;
    }

    let lastResponse = response;
    let retries = 0;
    const shouldRetry = shouldRetryRateLimitedRequest(input, init);

    while (lastResponse.status === 429) {
      const retryAfter = getRetryAfterSeconds(lastResponse);
      const willRetry = shouldRetry && retries < MAX_RETRIES;
      notifyRateLimit(
        retryAfter,
        buildRateLimitDebugDetails({
          input,
          init,
          response: lastResponse,
          retryAfterSeconds: retryAfter,
          retryAttempt: retries,
          willRetry,
        })
      );

      if (!willRetry) {
        return lastResponse;
      }

      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));

      retries++;
      lastResponse = await originalFetch(input, init);
    }

    return lastResponse;
  };
}
