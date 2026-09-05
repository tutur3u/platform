/** Same-origin transport for the independently deployed Colab Worker. */
export async function colabRequest<T>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (
    !/^\/(session|logout|rooms(?:\/[a-f0-9-]{36}(?:\/(join|action|password|ai))?)?)$/.test(
      path
    )
  )
    throw new Error('invalid_path');
  const response = await fetch(`/api${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result &&
        typeof result === 'object' &&
        'error' in result &&
        typeof result.error === 'string'
        ? result.error
        : 'request_failed'
    );
  return result as T;
}
