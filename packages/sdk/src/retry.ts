/**
 * Bounded retries for 429 and 503 errors that carry `Retry-After`.
 *
 * A request is retried only when its method is idempotent (GET, HEAD,
 * OPTIONS) or its call site marks it `retrySafe`, so a non-idempotent POST is
 * never sent twice by accident. Each wait is the server's `Retry-After` plus
 * 0-25% jitter, capped per wait and in total. An error without the header,
 * or one asking for longer than the per-wait cap, is thrown at once, and an
 * abort signal ends the wait.
 */

import { RateLimitError, ServiceUnavailableError } from './errors';

export const RETRY_AFTER_POLICY = {
  maxRetries: 2,
  maxDelayMs: 30_000,
  maxTotalDelayMs: 60_000,
  jitterRatio: 0.25,
} as const;

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type RetryAfterOptions = {
  /** Retries allowed by the caller's config, capped by the policy. */
  maxRetries?: number;
  /** Longest single wait allowed by the caller's config, capped by the policy. */
  maxDelayMs?: number;
  random?: () => number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export function isRetrySafeRequest(method = 'GET', retrySafe = false) {
  return retrySafe || IDEMPOTENT_METHODS.has(method.toUpperCase());
}

/** The server's `Retry-After` in seconds for a retryable error, if any. */
export function retryAfterSecondsOf(error: unknown) {
  return error instanceof RateLimitError ||
    error instanceof ServiceUnavailableError
    ? error.retryAfter
    : undefined;
}

/** The jittered, capped wait in milliseconds for a `Retry-After` value. */
export function retryAfterDelayMs(
  retryAfterSeconds: number,
  random: () => number = Math.random,
  maxDelayMs: number = RETRY_AFTER_POLICY.maxDelayMs
) {
  const jitter = 1 + random() * RETRY_AFTER_POLICY.jitterRatio;
  return Math.min(
    maxDelayMs,
    RETRY_AFTER_POLICY.maxDelayMs,
    Math.ceil(retryAfterSeconds * 1000 * jitter)
  );
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

/** Waits `ms`, rejecting with the signal's reason as soon as it aborts. */
export function abortableSleep(ms: number, signal?: AbortSignal) {
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

/** Runs `attempt`, retrying retryable errors under `RETRY_AFTER_POLICY`. */
export async function runWithRetryAfter<T>(
  attempt: () => Promise<T>,
  {
    maxRetries = RETRY_AFTER_POLICY.maxRetries,
    maxDelayMs = RETRY_AFTER_POLICY.maxDelayMs,
    random = Math.random,
    signal,
    sleep = abortableSleep,
  }: RetryAfterOptions = {}
): Promise<T> {
  const retries = Math.min(maxRetries, RETRY_AFTER_POLICY.maxRetries);
  let waitedMs = 0;
  for (let attemptIndex = 0; ; attemptIndex += 1) {
    try {
      return await attempt();
    } catch (error) {
      const seconds = retryAfterSecondsOf(error);
      const capMs = Math.min(maxDelayMs, RETRY_AFTER_POLICY.maxDelayMs);
      // A wait past the cap would only retry into a refusal.
      if (
        attemptIndex >= retries ||
        seconds === undefined ||
        !Number.isFinite(seconds) ||
        seconds * 1000 > capMs
      ) {
        throw error;
      }
      const delayMs = retryAfterDelayMs(seconds, random, maxDelayMs);
      if (waitedMs + delayMs > RETRY_AFTER_POLICY.maxTotalDelayMs) throw error;
      await sleep(delayMs, signal);
      waitedMs += delayMs;
    }
  }
}
