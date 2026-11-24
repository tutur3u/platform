import { LIMITS } from './policy';

export type FetchLike = typeof fetch;

/** Error that never carries a body, cookie or token: only status and label. */
export class HttpError extends Error {
  constructor(
    readonly label: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(`${label}: HTTP ${status}${code ? ` ${code}` : ''}`);
  }
}

export async function call(
  fetchImpl: FetchLike,
  label: string,
  url: string,
  init: RequestInit & { expect?: number[] } = {}
): Promise<{ status: number; json: unknown; headers: Headers }> {
  const { expect = [200], ...rest } = init;
  const response = await fetchImpl(url, {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(LIMITS.requestTimeoutMs),
    ...rest,
  });
  let json: unknown = null;
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    try {
      json = await response.json();
    } catch {
      json = null;
    }
  } else await response.body?.cancel();
  if (!expect.includes(response.status)) {
    const code =
      json && typeof json === 'object' && 'code' in json
        ? String((json as { code: unknown }).code).slice(0, 60)
        : undefined;
    throw new HttpError(label, response.status, code);
  }
  return { status: response.status, json, headers: response.headers };
}

export function jsonInit(
  method: string,
  body: unknown,
  headers: Record<string, string> = {}
): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}
