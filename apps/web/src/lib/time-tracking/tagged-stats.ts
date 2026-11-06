/**
 * Time-tracker stats for sessions that carry one tag (for example Pomodoro
 * focus), computed in TypeScript from the sessions themselves so no stats
 * database function changes.
 *
 * Mirrors `get_time_tracker_stats` and `calculate_time_tracker_streak`:
 * today, week (from Monday) and month totals in the user's timezone, daily
 * activity over the last `daysBack` days, newest first, and a streak of
 * consecutive active days ending today or yesterday.
 *
 * One difference: a session counts entirely on the local day it started,
 * rather than being split at midnight. Tagged Pomodoro focus sessions are
 * short, so this rarely matters. The streak only sees the lookback window.
 */

export interface TaggedSession {
  start_time: string;
  duration_seconds: number | null;
}

export interface TaggedTimeStats {
  todayTime: number;
  weekTime: number;
  monthTime: number;
  streak: number;
  dailyActivity: { date: string; duration: number; sessions: number }[];
}

/** Days of sessions to read: at least a month, as the database does. */
export function taggedStatsLookbackDays(daysBack: number): number {
  return Math.max(31, daysBack) + 1;
}

/** The `YYYY-MM-DD` local date of `instant` in `timezone`. */
export function localDate(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function startOfWeek(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((weekday + 6) % 7));
}

export function computeTaggedTimeStats(
  sessions: readonly TaggedSession[],
  options: { timezone: string; now: Date; daysBack: number }
): TaggedTimeStats {
  const { timezone, now, daysBack } = options;
  const today = localDate(now, timezone);
  const weekStart = startOfWeek(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const activityFrom = shiftDate(today, -daysBack);

  const byDay = new Map<string, { duration: number; sessions: number }>();
  for (const session of sessions) {
    const duration = session.duration_seconds ?? 0;
    if (duration <= 0) continue;
    const day = localDate(new Date(session.start_time), timezone);
    if (day > today) continue;
    const entry = byDay.get(day) ?? { duration: 0, sessions: 0 };
    entry.duration += duration;
    entry.sessions += 1;
    byDay.set(day, entry);
  }

  let todayTime = 0;
  let weekTime = 0;
  let monthTime = 0;
  for (const [day, entry] of byDay) {
    if (day === today) todayTime += entry.duration;
    if (day >= weekStart) weekTime += entry.duration;
    if (day >= monthStart) monthTime += entry.duration;
  }

  let streak = 0;
  let cursor = byDay.has(today) ? today : shiftDate(today, -1);
  while (byDay.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }

  const dailyActivity = [...byDay.entries()]
    .filter(([day]) => day >= activityFrom)
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, entry]) => ({
      date,
      duration: entry.duration,
      sessions: entry.sessions,
    }));

  return { todayTime, weekTime, monthTime, streak, dailyActivity };
}
