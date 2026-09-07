export class ColabRequestError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ColabRequestError';
  }
}

/** Same-origin transport for the independently deployed Colab Worker. */
export async function colabRequest<T>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (
    !/^\/(session|logout|workshops|rooms(?:\/[a-f0-9-]{36}(?:\/(join|action|password|ai))?)?)$/.test(
      path
    )
  )
    throw new Error('invalid_path');
  const response = await fetch(`/api${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new ColabRequestError(
      result &&
        typeof result === 'object' &&
        'error' in result &&
        typeof result.error === 'string'
        ? result.error
        : 'request_failed',
      response.status
    );
  return result as T;
}
