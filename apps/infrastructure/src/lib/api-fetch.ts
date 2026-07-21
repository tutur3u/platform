export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    let message = response.statusText || `HTTP ${response.status}`;

    try {
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      message = body.error || body.message || message;
    } catch {
      // Keep the HTTP fallback when the response is not JSON.
    }

    throw new HttpError(response.status, message);
  }

  return response.json() as Promise<T>;
}
