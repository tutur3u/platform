/**
 * Calendar periods in Vietnam time (UTC+7, no DST), where the team works.
 * Keys: week `2026-W45` (ISO 8601 week), month `2026-11`, year `2026`.
 */

export const views = ['week', 'month', 'year'] as const;
export type View = (typeof views)[number];

const OFFSET = 7 * 3_600_000;
const DAY = 86_400_000;

/** `YYYY-MM-DD` of an instant in UTC+7. */
export function localDate(iso: string | number): string {
  const time = typeof iso === 'number' ? iso : Date.parse(iso);
  return new Date(time + OFFSET).toISOString().slice(0, 10);
}

function dayNumber(date: string) {
  return Date.parse(`${date}T00:00:00Z`) / DAY;
}

/** ISO 8601 week of a `YYYY-MM-DD` calendar date. */
export function isoWeek(date: string): { year: number; week: number } {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const year = day.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const week = Math.ceil(((day.getTime() - start) / DAY + 1) / 7);
  return { year, week };
}

export function periodKey(date: string, view: View): string {
  if (view === 'year') return date.slice(0, 4);
  if (view === 'month') return date.slice(0, 7);
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

const KEY = {
  week: /^(\d{4})-W(\d{2})$/,
  month: /^(\d{4})-(0[1-9]|1[0-2])$/,
  year: /^(\d{4})$/,
} as const;

export function isPeriodKey(key: string, view: View) {
  const match = KEY[view].exec(key);
  if (!match) return false;
  if (view !== 'week') return true;
  const week = Number(match[2]);
  return (
    week >= 1 && week <= 53 && periodKey(periodStart(key, view), view) === key
  );
}

/** First calendar date (`YYYY-MM-DD`) of a period. */
export function periodStart(key: string, view: View): string {
  if (view === 'year') return `${key}-01-01`;
  if (view === 'month') return `${key}-01`;
  const [, y, w] = KEY.week.exec(key) ?? [];
  const jan4 = new Date(Date.UTC(Number(y), 0, 4));
  const monday =
    Date.UTC(Number(y), 0, 4) - ((jan4.getUTCDay() || 7) - 1) * DAY;
  return new Date(monday + (Number(w) - 1) * 7 * DAY)
    .toISOString()
    .slice(0, 10);
}

/** Last calendar date (`YYYY-MM-DD`) of a period. */
export function periodEnd(key: string, view: View): string {
  const start = periodStart(key, view);
  if (view === 'week')
    return new Date((dayNumber(start) + 6) * DAY).toISOString().slice(0, 10);
  if (view === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }
  return `${key}-12-31`;
}

/** Every period key from the one containing `from` to the one containing `to`. */
export function periodRange(from: string, to: string, view: View): string[] {
  const keys: string[] = [];
  let cursor = periodStart(periodKey(from, view), view);
  const last = periodKey(to, view);
  for (let guard = 0; guard < 5000; guard += 1) {
    const key = periodKey(cursor, view);
    keys.push(key);
    if (key === last) break;
    const end = periodEnd(key, view);
    cursor = new Date((dayNumber(end) + 1) * DAY).toISOString().slice(0, 10);
  }
  return keys;
}

export function shiftPeriod(key: string, view: View, delta: number): string {
  let cursor = key;
  for (let i = 0; i < Math.abs(delta); i += 1) {
    const edge =
      delta > 0
        ? dayNumber(periodEnd(cursor, view)) + 1
        : dayNumber(periodStart(cursor, view)) - 1;
    cursor = periodKey(new Date(edge * DAY).toISOString().slice(0, 10), view);
  }
  return cursor;
}
