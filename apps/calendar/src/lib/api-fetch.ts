/**
 * Enhanced fetch wrapper with HTTP error handling and rate-limit awareness.
 *
 * Use `apiFetch` instead of raw `fetch()` in `queryFn` / `mutationFn` to get:
 * - Automatic `HttpError` throw on non-2xx responses
 * - Structured error with status code and optional `retryAfter`
 * - Compatibility with QueryClient retry logic for 429 responses
 */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Seconds to wait before retrying (from `Retry-After` header). */
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Fetch wrapper that throws `HttpError` on non-2xx responses.
 *
 * @example
 * const data = await apiFetch<{ items: Item[] }>('/api/v1/items');
 *
 * @example
 * const result = await apiFetch<{ id: string }>('/api/v1/items', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ name: 'New item' }),
 * });
 */
export async function apiFetch<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const retryAfter =
      response.status === 429
        ? parseInt(response.headers.get('Retry-After') || '5', 10)
        : undefined;

    let message: string;
    try {
      const body = await response.json();
      message = body.error || body.message || `HTTP ${response.status}`;
    } catch {
      message = response.statusText || `HTTP ${response.status}`;
    }

    throw new HttpError(response.status, message, retryAfter);
  }

  return response.json() as Promise<T>;
}

/** Type guard for HttpError with a specific status code. */
export function isRateLimitError(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status === 429;
}
