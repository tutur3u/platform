// Pure habit-goal streak math for task progress goals (TrackBear-style habits).
// Buckets effective progress into per-day / per-week / per-month periods and
// reports current / longest / typical streaks plus percent-of-periods-hit.
// Kept dependency-free so it is trivially unit-testable.

export type HabitFrequency = 'per_day' | 'per_week' | 'per_month';

export interface HabitStreakInput {
  entries: Array<{ entry_date: string; value: number }>;
  frequency: HabitFrequency;
  /** Minimum period total to count as "hit". 0/undefined ⇒ any positive total. */
  threshold?: number | null;
  /** Goal period start (YYYY-MM-DD). */
  periodStart: string;
  /** Override "today" for deterministic tests (YYYY-MM-DD). */
  now?: string;
}

export interface HabitStreakResult {
  current_streak: number;
  longest_streak: number;
  typical_streak: number;
  periods_hit: number;
  periods_total: number;
  period_value: number;
  percent_hit: number;
}

const DAY_MS = 86_400_000;
const WEEK_STARTS_ON = 1; // Monday, matching the habit-tracker convention.

function parseUtc(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function formatUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function startOfWeek(date: Date) {
  const diff = (date.getUTCDay() - WEEK_STARTS_ON + 7) % 7;
  return addDays(date, -diff);
}

/** Canonical key for the period a given date falls into. */
function periodKey(dateKey: string, frequency: HabitFrequency): string {
  if (frequency === 'per_day') return dateKey;
  if (frequency === 'per_week')
    return formatUtc(startOfWeek(parseUtc(dateKey)));
  return dateKey.slice(0, 7); // YYYY-MM
}

/** Ordered list of period keys from start through the current period. */
function enumeratePeriods(
  startKey: string,
  nowKey: string,
  frequency: HabitFrequency
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const end = parseUtc(nowKey);

  if (frequency === 'per_month') {
    let cursor = parseUtc(`${startKey.slice(0, 7)}-01`);
    const endMonth = parseUtc(`${nowKey.slice(0, 7)}-01`);
    while (cursor.getTime() <= endMonth.getTime()) {
      keys.push(formatUtc(cursor).slice(0, 7));
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
      );
    }
    return keys;
  }

  const step = frequency === 'per_week' ? 7 : 1;
  let cursor =
    frequency === 'per_week'
      ? startOfWeek(parseUtc(startKey))
      : parseUtc(startKey);
  while (cursor.getTime() <= end.getTime()) {
    const key = periodKey(formatUtc(cursor), frequency);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    cursor = addDays(cursor, step);
  }
  return keys;
}

export function computeTaskProgressHabitStreaks(
  input: HabitStreakInput
): HabitStreakResult {
  const nowKey = input.now ?? formatUtc(new Date());
  const threshold = Number(input.threshold ?? 0);
  const isHit = (total: number) =>
    threshold > 0 ? total >= threshold : total > 0;

  const totals = new Map<string, number>();
  for (const entry of input.entries) {
    if (!entry.entry_date) continue;
    if (entry.entry_date < input.periodStart || entry.entry_date > nowKey)
      continue;
    const key = periodKey(entry.entry_date, input.frequency);
    totals.set(key, (totals.get(key) ?? 0) + Number(entry.value || 0));
  }

  const periods = enumeratePeriods(input.periodStart, nowKey, input.frequency);
  const currentKey = periodKey(nowKey, input.frequency);
  const hits = periods.map((key) => ({
    key,
    total: totals.get(key) ?? 0,
    hit: isHit(totals.get(key) ?? 0),
    isCurrent: key === currentKey,
  }));

  // Longest streak + all run lengths (over every period).
  let longest = 0;
  let run = 0;
  const runLengths: number[] = [];
  for (const period of hits) {
    if (period.hit) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      if (run > 0) runLengths.push(run);
      run = 0;
    }
  }
  if (run > 0) runLengths.push(run);

  // Current streak: count back from the end. An in-progress current period that
  // is not yet hit does not break the streak.
  let index = hits.length - 1;
  if (index >= 0 && hits[index]?.isCurrent && !hits[index]?.hit) index -= 1;
  let current = 0;
  while (index >= 0 && hits[index]?.hit) {
    current += 1;
    index -= 1;
  }

  // Percent-hit and typical are computed over CLOSED periods only.
  const closed = hits.filter((period) => !period.isCurrent);
  const periodsHit = closed.filter((period) => period.hit).length;
  const periodsTotal = closed.length;
  const typical =
    runLengths.length > 0
      ? Number(
          (
            runLengths.reduce((sum, length) => sum + length, 0) /
            runLengths.length
          ).toFixed(1)
        )
      : 0;

  return {
    current_streak: current,
    longest_streak: longest,
    typical_streak: typical,
    periods_hit: periodsHit,
    periods_total: periodsTotal,
    period_value: totals.get(currentKey) ?? 0,
    percent_hit:
      periodsTotal > 0
        ? Number(((periodsHit / periodsTotal) * 100).toFixed(1))
        : 0,
  };
}
