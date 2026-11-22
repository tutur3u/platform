/**
 * Seconds from a `Retry-After` value: delta seconds or an HTTP date, rounded
 * up. Anything else, including a missing header, is undefined, so it never
 * turns into a near-immediate retry.
 */
export function parseRetryAfterSeconds(
  value: string | null | undefined,
  now = Date.now()
): number | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (/^\d+$/u.test(raw)) return Number(raw);
  const date = Date.parse(raw);
  return Number.isNaN(date)
    ? undefined
    : Math.max(0, Math.ceil((date - now) / 1000));
}
