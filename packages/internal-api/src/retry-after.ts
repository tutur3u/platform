/**
 * Bounded retries for 429 and 503 answers that carry `Retry-After`.
 *
 * A request is retried only when its method is idempotent (GET, HEAD,
 * OPTIONS) or its call site marks it `retrySafe`, so a non-idempotent POST is
 * never sent twice by accident. Each wait is the server's `Retry-After` plus
 * 0-25% jitter, capped per wait and in total. An answer without the header,
 * or one asking for longer than the per-wait cap, is returned at once, and an
 * abort signal ends the wait. Server-side callers get a shorter total cap so
 * a limited dependency does not hold a request open for a minute.
 */
export const RETRY_AFTER_POLICY = {
  maxRetries: 2,
  maxDelayMs: 30_000,
  maxTotalDelayMs: 60_000,
  serverMaxTotalDelayMs: 10_000,
  jitterRatio: 0.25,
} as const;

const RETRY_STATUSES = new Set([429, 503]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type RetryAfterInit = {
  method?: string;
  /**
   * Retry a 429 or 503 with `Retry-After` although the method is not
   * idempotent. Set only for calls without side effects, such as minting a
   * signed URL.
   */
  retrySafe?: boolean;
  signal?: AbortSignal | null;
};

export type RetryAfterDependencies = {
  /** Defaults to the server or browser total cap for this runtime. */
  maxTotalDelayMs?: number;
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal | null) => Promise<void>;
};

export function isRetrySafeRequest(method = 'GET', retrySafe = false) {
  return retrySafe || IDEMPOTENT_METHODS.has(method.toUpperCase());
}

/** Seconds from a `Retry-After` value (delta seconds or an HTTP date). */
export function parseRetryAfterSeconds(
  value: string | null | undefined,
  now = Date.now()
) {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^\d+$/u.test(raw)) return Number(raw);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, (date - now) / 1000);
}

/** The jittered, capped wait in milliseconds for a `Retry-After` value. */
export function retryAfterDelayMs(
  retryAfterSeconds: number,
  random: () => number = Math.random
) {
  const jitter = 1 + random() * RETRY_AFTER_POLICY.jitterRatio;
  return Math.min(
    RETRY_AFTER_POLICY.maxDelayMs,
    Math.ceil(retryAfterSeconds * 1000 * jitter)
  );
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

/** Waits `ms`, rejecting with the signal's reason as soon as it aborts. */
export function abortableSleep(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Wraps a request function so eligible 429 and 503 answers are retried under
 * `RETRY_AFTER_POLICY`. The last answer is returned when retries run out.
 */
export function withRetryAfter<Init extends RetryAfterInit>(
  send: (path: string, init?: Init) => Promise<Response>,
  {
    maxTotalDelayMs = typeof window === 'undefined'
      ? RETRY_AFTER_POLICY.serverMaxTotalDelayMs
      : RETRY_AFTER_POLICY.maxTotalDelayMs,
    random = Math.random,
    sleep = abortableSleep,
  }: RetryAfterDependencies = {}
) {
  return async (path: string, init: Init = {} as Init) => {
    const { retrySafe, ...rest } = init;
    const request = rest as Init;
    if (!isRetrySafeRequest(init.method, retrySafe)) {
      return send(path, request);
    }

    let waitedMs = 0;
    for (let attempt = 0; ; attempt += 1) {
      const response = await send(path, request);
      if (
        attempt >= RETRY_AFTER_POLICY.maxRetries ||
        !RETRY_STATUSES.has(response.status)
      ) {
        return response;
      }
      const seconds = parseRetryAfterSeconds(
        response.headers.get('retry-after')
      );
      // A wait past the cap would only retry into a refusal.
      if (seconds === null || seconds * 1000 > RETRY_AFTER_POLICY.maxDelayMs) {
        return response;
      }
      const delayMs = retryAfterDelayMs(seconds, random);
      if (waitedMs + delayMs > maxTotalDelayMs) return response;
      await response.body?.cancel().catch(() => undefined);
      await sleep(delayMs, init.signal);
      waitedMs += delayMs;
    }
  };
}
