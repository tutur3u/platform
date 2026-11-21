import type { ShipSourceProblem } from './snapshot';

export const SHIP_RESPONSE_MAX_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 15_000;
const MIN_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const DEFAULT_BACKOFF_MS = 10 * 60_000;

export interface ShipFetchDeps {
  deadline: number;
  fetch: typeof fetch;
  now: () => number;
  signal?: AbortSignal;
}

/** Counts provider requests so one run never exceeds its budget. */
export class RequestBudget {
  used = 0;
  constructor(readonly limit: number) {}
  take() {
    if (this.used >= this.limit) return false;
    this.used++;
    return true;
  }
}

export class ShipSourceError extends Error {
  constructor(
    readonly problem: ShipSourceProblem,
    /** Epoch ms before which the source must not be read again. */
    readonly retryAt: number | null = null
  ) {
    super(problem);
  }
}

export type ShipResponse =
  | { status: 304; headers: Headers }
  | { status: 200; headers: Headers; json: unknown };

/** Backoff for a refused request: Retry-After, then the rate-limit reset. */
export function backoffUntil(headers: Headers, now: number) {
  const retryAfter = Number(headers.get('retry-after'));
  const reset = Number(headers.get('x-ratelimit-reset'));
  const wait =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Number.isFinite(reset) && reset > 0
        ? reset * 1000 - now
        : DEFAULT_BACKOFF_MS;
  return now + Math.min(MAX_BACKOFF_MS, Math.max(MIN_BACKOFF_MS, wait));
}

/**
 * One read request: per-request timeout inside the run deadline, no
 * redirects, a 1 MiB response cap and a request budget. 403 and 429 become a
 * backoff; credentials are never logged and errors carry a class only.
 */
export async function shipFetch(
  deps: ShipFetchDeps,
  budget: RequestBudget,
  url: URL,
  init: {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: string;
  }
): Promise<ShipResponse> {
  const remaining = deps.deadline - deps.now();
  if (remaining <= 0) throw new ShipSourceError('timeout');
  if (!budget.take()) throw new ShipSourceError('rate-limited');
  const timeout = AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining));
  let response: Response;
  try {
    response = await deps.fetch(url, {
      ...init,
      redirect: 'manual',
      signal: deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout,
    });
  } catch {
    throw new ShipSourceError('timeout');
  }
  if (response.status === 304) {
    void response.body?.cancel().catch(() => undefined);
    return { status: 304, headers: response.headers };
  }
  if (response.status === 403 || response.status === 429) {
    void response.body?.cancel().catch(() => undefined);
    const limited =
      response.status === 429 ||
      response.headers.get('x-ratelimit-remaining') === '0' ||
      response.headers.has('retry-after');
    throw limited
      ? new ShipSourceError(
          'rate-limited',
          backoffUntil(response.headers, deps.now())
        )
      : new ShipSourceError('auth');
  }
  if (response.status === 401) {
    void response.body?.cancel().catch(() => undefined);
    throw new ShipSourceError('auth');
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new ShipSourceError('http');
  }
  return {
    status: 200,
    headers: response.headers,
    json: await readJson(response),
  };
}

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ShipSourceError('invalid');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > SHIP_RESPONSE_MAX_BYTES) throw new ShipSourceError('invalid');
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
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } catch {
    throw new ShipSourceError('invalid');
  }
}

export const SHA = /^[0-9a-f]{40}$/u;

/** A provider timestamp normalized to UTC ISO with milliseconds. */
export function isoOrNull(value: unknown) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
