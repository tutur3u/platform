// Signed calls from the fleet publisher to Web, with a per-route pause after
// Web answers 429. Every publisher run is a new process, so the pause is kept
// on disk; a paused route fails fast without a request until its time passes.

const WEB_TIMEOUT_MS = 6_000;
/** One publisher interval: the shortest pause worth recording. */
export const BACKOFF_MIN_MS = 15_000;
/**
 * A day-window 429 names the window boundary in `Retry-After`, up to a day
 * away, while a sliding window admits calls again much sooner. The cap keeps
 * owner answers and alerts from waiting on Web that long.
 */
export const BACKOFF_MAX_MS = 5 * 60_000;

export class RateLimitedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitedError';
  }
}

export const isRateLimited = (error) => error instanceof RateLimitedError;

/** `Retry-After` in seconds or as an HTTP date, clamped to the pause bounds. */
export function retryAfterMs(header, nowMs) {
  const text = String(header ?? '').trim();
  const wait = /^\d{1,9}$/.test(text)
    ? Number(text) * 1000
    : Date.parse(text) - nowMs;
  if (!Number.isFinite(wait)) return BACKOFF_MIN_MS;
  return Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, wait));
}

/**
 * Pauses per `<METHOD> <path>`, stored as `{ route: untilMs }`. A stored time
 * beyond the cap (a clock change, a damaged file) counts as the cap.
 */
export function createWebBackoff({ file, read, write, now = Date.now }) {
  const live = () => {
    const pauses = {};
    for (const [route, until] of Object.entries(read(file) ?? {})) {
      if (!Number.isFinite(until) || until <= now()) continue;
      pauses[route] = Math.min(until, now() + BACKOFF_MAX_MS);
    }
    return pauses;
  };
  return {
    until: (route) => live()[route] ?? 0,
    note(route, retryAfter) {
      const until = now() + retryAfterMs(retryAfter, now());
      try {
        write(file, { ...live(), [route]: until });
      } catch {
        // An unwritable pause file costs one extra request next run.
      }
      return until;
    },
  };
}

/**
 * One signed request. Throws `RateLimitedError` for a 429 or a paused route,
 * and `<METHOD> <path> <status>` for any other refusal.
 */
export async function callWeb(
  { fetchImpl, origin, secret, sign, tickEnd, backoff },
  method,
  pathWithQuery,
  body = ''
) {
  const remaining = tickEnd - Date.now();
  if (remaining < 500) throw new Error('tick_budget_exhausted');
  const route = `${method} ${pathWithQuery.split('?')[0]}`;
  if (backoff && backoff.until(route) > Date.now())
    throw new RateLimitedError(`${route} paused`);
  const response = await fetchImpl(`${origin}${pathWithQuery}`, {
    method,
    headers: {
      ...sign(secret, method, pathWithQuery, body),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(Math.min(WEB_TIMEOUT_MS, remaining)),
  });
  if (response.status === 429) {
    backoff?.note(route, response.headers?.get?.('retry-after'));
    throw new RateLimitedError(`${route} 429`);
  }
  if (!response.ok) throw new Error(`${route} ${response.status}`);
  return response.json();
}
