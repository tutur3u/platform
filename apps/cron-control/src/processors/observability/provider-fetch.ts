import { ProviderError, PROVIDER_RESPONSE_MAX_BYTES } from './collector';

export interface ProviderFetchDeps {
  deadline: number;
  fetch: typeof fetch;
  now: () => number;
  signal?: AbortSignal;
}

const PROVIDER_TIMEOUT_MS = 20_000;

/**
 * One read-only provider request with a per-request timeout inside the run
 * deadline, no redirects and a 1 MiB response cap. Credentials travel only in
 * the given headers and are never logged; errors carry the status class only.
 */
export async function fetchProviderJson(
  deps: ProviderFetchDeps,
  url: URL,
  init: {
    body?: string;
    headers: Record<string, string>;
    method: 'GET' | 'POST';
  }
): Promise<{ json: unknown; headers: Headers }> {
  const remaining = deps.deadline - deps.now();
  if (remaining <= 0) throw new DOMException('Run deadline', 'TimeoutError');
  const timeout = AbortSignal.timeout(Math.min(PROVIDER_TIMEOUT_MS, remaining));
  const signal = deps.signal
    ? AbortSignal.any([deps.signal, timeout])
    : timeout;
  const response = await deps.fetch(url, {
    ...init,
    redirect: 'manual',
    signal,
  });
  if (response.status === 429) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderError('rate-limited');
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderError('http');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('invalid');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > PROVIDER_RESPONSE_MAX_BYTES)
        throw new ProviderError('invalid');
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { json: JSON.parse(text), headers: response.headers };
  } catch {
    throw new ProviderError('invalid');
  }
}
