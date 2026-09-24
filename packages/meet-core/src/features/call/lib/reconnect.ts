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
 * Whether another attempt is worth making. A socket the server closed with a
 * policy code is a decision, not a blip — retrying a removed participant back
 * into the room would be wrong.
 */
export function shouldReconnect(
  attempt: number,
  closeCode?: number,
  maxAttempts = RECONNECT_MAX_ATTEMPTS
): boolean {
  if (attempt >= maxAttempts) return false;
  // 1000 is a clean close; 4403 is our own "removed from room".
  if (closeCode === 1000 || closeCode === 4403) return false;
  return true;
}
