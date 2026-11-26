/** A plain decimal positive integer, or null. */
function strictPositiveInt(raw: string | undefined): number | null {
  const value = raw?.trim();
  if (!value || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * A positive integer from the environment, or the fallback. Only a plain
 * decimal integer counts: a zero, negative, fractional or partly numeric
 * value such as `12abc` keeps the fallback. When the primary name is unset,
 * the aliases are read in order and the first valid one wins.
 */
export function parsePositiveIntEnv(
  name: string,
  fallback: number,
  aliases: readonly string[] = []
): number {
  if (process.env[name])
    return strictPositiveInt(process.env[name]) ?? fallback;
  for (const alias of aliases) {
    const parsed = strictPositiveInt(process.env[alias]);
    if (parsed !== null) return parsed;
  }
  return fallback;
}
