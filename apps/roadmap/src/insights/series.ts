/**
 * Small, pure time-series helpers for the shipping pulse and the stat tiles:
 * day windows, a trailing moving average, period-over-period change and
 * quantiles. Days are Vietnam calendar days (YYYY-MM-DD).
 */

export const RANGES = [7, 14, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = 14;

const DAY_MS = 86_400_000;

export function isRange(value: unknown): value is Range {
  return RANGES.includes(value as Range);
}

/** `count` consecutive days ending on `last`, oldest first. */
export function dayKeys(last: string, count: number): string[] {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) =>
    new Date(end - (count - 1 - index) * DAY_MS).toISOString().slice(0, 10)
  );
}

export function shiftDay(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Trailing moving average over `window` points. A point is null until a full
 * window exists, and whenever the window holds a missing (null) value, so
 * the line never averages over days nobody observed.
 */
export function movingAverage(
  values: readonly (number | null)[],
  window = 7
): (number | null)[] {
  return values.map((_, index) => {
    if (index + 1 < window) return null;
    let sum = 0;
    for (let i = index + 1 - window; i <= index; i += 1) {
      const value = values[i];
      if (value === null || value === undefined) return null;
      sum += value;
    }
    return sum / window;
  });
}

export type Change = {
  current: number;
  previous: number;
  delta: number;
  /** Relative change; null when the previous period was zero. */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
};

/** Change from `previous` to `current`. */
export function change(current: number, previous: number): Change {
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    pct: previous === 0 ? null : delta / previous,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
  };
}

/** Linear-interpolated quantile (q in [0, 1]) of unsorted values. */
export function quantile(values: readonly number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] as number;
  const high = sorted[upper] as number;
  return low + (high - low) * (position - lower);
}

/** Sum of the non-null values, or null if every value is null. */
export function sumKnown(values: readonly (number | null)[]): number | null {
  let seen = false;
  let sum = 0;
  for (const value of values)
    if (value !== null) {
      seen = true;
      sum += value;
    }
  return seen ? sum : null;
}
