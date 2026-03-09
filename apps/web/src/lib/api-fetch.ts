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

/**
 * Uploads a file to a signed storage URL, handling storage capacity errors centrally.
 * This ensures that standard error messages (e.g. out of storage limit, Sonner toasts)
 * are consistent throughout the entire application.
 */
export async function uploadToStorageUrl(
  signedUrl: string,
  file: File | Blob,
  token?: string
): Promise<void> {
  let finalFile = file;

  if (
    typeof window !== 'undefined' &&
    file.type.startsWith('image/') &&
    !file.type.includes('svg')
  ) {
    try {
      const imageCompression = (await import('browser-image-compression'))
        .default;
      finalFile = await imageCompression(file as File, {
        maxSizeMB: 20, // Allow high resolution uploads, just optimize the raw file
        maxWidthOrHeight: 7680, // Up to 8K resolution
        useWebWorker: true,
        initialQuality: 0.8,
      });
    } catch (e) {
      console.warn('Image compression failed, using original file', e);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': finalFile.type || 'application/octet-stream',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers,
    body: finalFile,
  });

  if (!response.ok) {
    let errorMsg = `Upload failed (${response.status})`;
    try {
      const text = await response.text();
      if (text.includes('Storage limit exceeded')) {
        throw new Error(
          'Workspace storage limit exceeded. Please free up space or upgrade your plan.'
        );
      }

      try {
        const body = JSON.parse(text);
        errorMsg = body.error || body.message || errorMsg;
      } catch {
        errorMsg = text || errorMsg;
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('Storage limit exceeded')) {
        throw e;
      }
      // text() might fail, fallback to generic errorMsg
    }
    throw new Error(errorMsg);
  }
}
