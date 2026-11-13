export interface BackoffOptions {
  baseMs?: number;
  jitter?: () => number;
  maxMs?: number;
}

export const RECONNECT_BASE_MS = 500;
export const RECONNECT_MAX_MS = 15_000;
export const RECONNECT_MAX_ATTEMPTS = 12;

/**
 * Exponential backoff with full jitter.
 *
 * Jitter matters here specifically: a room server restart drops every
 * participant at the same instant, and without it they would all retry in
 * lockstep and hammer the server back down.
 */
export function computeBackoffMs(
  attempt: number,
  {
    baseMs = RECONNECT_BASE_MS,
    jitter = Math.random,
    maxMs = RECONNECT_MAX_MS,
  }: BackoffOptions = {}
): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const ceiling = Math.min(maxMs, baseMs * 2 ** safeAttempt);
  return Math.round(ceiling * jitter());
}

/**
 * A socket the server closed with one of these codes is a decision, not a
 * blip: 1000 is a clean close and 4403 is our own "removed from room".
 * Retrying a removed participant back into the room would be wrong.
 */
export const TERMINAL_CLOSE_CODES: ReadonlySet<number> = new Set([1000, 4403]);

export function isTerminalCloseCode(closeCode?: number): boolean {
  return closeCode !== undefined && TERMINAL_CLOSE_CODES.has(closeCode);
}

/**
 * Whether another attempt is worth making. Every non-terminal close is
 * retried within the budget, including the codes a deploy produces: 1001
 * (going away), 1012 (service restart) and 1006 (abnormal closure, what a
 * replaced isolate looks like to the browser).
 */
export function shouldReconnect(
  attempt: number,
  closeCode?: number,
  maxAttempts = RECONNECT_MAX_ATTEMPTS
): boolean {
  if (isTerminalCloseCode(closeCode)) return false;
  return attempt < maxAttempts;
}
