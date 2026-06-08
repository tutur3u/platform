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
 * Non-idempotent requests should handle 429 responses at the call site so one
 * user action does not consume multiple server-side rate-limit attempts.
 *
 * i18n: Call `setRateLimitMessage(fn)` from a React component inside
 * `NextIntlClientProvider` to provide translated messages. The interceptor
 * installs at module scope (before React renders) with an English fallback.
 */

import { toast } from '@tuturuuu/ui/sonner';

const MAX_RETRIES = 3;

/** Formats the rate-limit toast message. Overridden by `setRateLimitMessage`. */
let formatMessage = (seconds: number): string =>
  `You're being rate limited. Retrying in ${seconds}s…`;

/**
 * Replaces the default English message with a translated formatter.
 * Call this from a React component that has access to `useTranslations`.
 */
export function setRateLimitMessage(fn: (seconds: number) => string) {
  formatMessage = fn;
}

let rateLimitToastActive = false;

function notifyRateLimit(retryAfter: number) {
  if (rateLimitToastActive) return;
  rateLimitToastActive = true;
  toast.warning(formatMessage(retryAfter), {
    duration: (retryAfter + 1) * 1000,
    onDismiss: () => {
      rateLimitToastActive = false;
    },
    onAutoClose: () => {
      rateLimitToastActive = false;
    },
  });
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

    // Only retry idempotent same-origin requests — never interfere with
    // external resources or replay mutations.
    if (
      !isSameOrigin(input) ||
      response.status !== 429 ||
      !shouldRetryRateLimitedRequest(input, init)
    ) {
      return response;
    }

    let lastResponse = response;
    let retries = 0;

    while (lastResponse.status === 429 && retries < MAX_RETRIES) {
      retries++;
      const retryAfter = Math.min(
        parseInt(lastResponse.headers.get('Retry-After') || '5', 10),
        60 // Cap at 60s to avoid extremely long waits
      );

      notifyRateLimit(retryAfter);

      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));

      lastResponse = await originalFetch(input, init);
    }

    return lastResponse;
  };
}
